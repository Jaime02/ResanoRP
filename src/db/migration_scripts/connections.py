import os
import subprocess
import sys
from collections.abc import Generator
from contextlib import contextmanager
from pathlib import Path
import fdb
import pyodbc
from dotenv import load_dotenv
import psycopg
from psycopg.rows import TupleRow
from tqdm import tqdm

RAIO_SERVER = "localhost\\SQLEXPRESS"
RAIO_DATABASE = "Raio"

project_root = Path(__file__).parent.parent.parent.parent
load_dotenv((project_root / "envs" / ".env.prisma").resolve())



def require_env(name: str) -> str:
    if (value := os.getenv(name)) is None:
        raise RuntimeError(f"{name} environment variable is not set")
    return value


POSTGRES_URL = require_env("DATABASE_URL")

FB_HOST = os.getenv("FB_HOST")
FB_DATABASE = (project_root / require_env("FB_DATABASE")).resolve()
FB_USER = os.getenv("FB_USER")
FB_PASSWORD = os.getenv("FB_PASSWORD")


def setup():
    try:
        # `bun run prisma` is the foreground watcher; without it the exec target doesn't exist
        subprocess.run(
            "docker compose -p resanorp-prisma --project-directory . -f docker/docker-compose.base.yml -f docker/docker-compose.prisma.yml --env-file ./envs/.env.prisma --profile prisma up -d --wait app-prisma",
            check=True,
            capture_output=True,
            text=True,
            shell=True,
            cwd=project_root,
        )
        subprocess.run(
            ["bun", "run", "reset-env:prisma"],
            check=True,
            capture_output=True,
            text=True,
            shell=True,
            cwd=project_root,
        )
        tqdm.write("1. Environment reset")
    except FileNotFoundError as e:
        tqdm.write(str(e))
        sys.exit(1)
    except subprocess.CalledProcessError as e:
        tqdm.write(f"Reset env command failed with exit code {e.returncode}")
        tqdm.write(f"stdout:\n{e.stdout}")
        tqdm.write(f"stderr:\n{e.stderr}")
        sys.exit(1)
    except Exception as e:
        tqdm.write(
            f"An unexpected error occurred while running drizzle database reset: {e}"
        )
        sys.exit(1)


@contextmanager
def get_raio_cursor(database: str = RAIO_DATABASE) -> Generator[pyodbc.Cursor]:
    conn = pyodbc.connect(
        f"Driver={{SQL Server}};Server={RAIO_SERVER};Database={database};Trusted_Connection=yes;",
        autocommit=True,
    )
    cursor = conn.cursor()
    try:
        yield cursor
    finally:
        cursor.close()
        conn.close()


@contextmanager
def get_postgres_cursor() -> Generator[psycopg.Cursor[TupleRow]]:
    conn = None
    try:
        conn = psycopg.connect(POSTGRES_URL)
        conn.add_notice_handler(lambda diag: tqdm.write(f"{diag.severity}: {diag.message_primary}"))

        cursor = conn.cursor()
        cursor.execute("SET session_replication_role = 'replica';")
        try:
            yield cursor
            conn.commit()
            cursor.execute("SET session_replication_role = 'origin';")
            cursor.execute(
                """
DO $$
DECLARE
    r RECORD;
    orphan_count BIGINT;
    sql_text TEXT;
BEGIN
    FOR r IN
        SELECT
            conname,
            conrelid::regclass AS child_table,
            confrelid::regclass AS parent_table,
            pg_get_constraintdef(oid) AS def,
            (SELECT array_agg(attname ORDER BY ord)
             FROM unnest(conkey) WITH ORDINALITY AS ck(attnum, ord)
             JOIN pg_attribute a ON a.attnum = ck.attnum AND a.attrelid = conrelid
            ) AS child_cols,
            (SELECT array_agg(attname ORDER BY ord)
             FROM unnest(confkey) WITH ORDINALITY AS ck(attnum, ord)
             JOIN pg_attribute a ON a.attnum = ck.attnum AND a.attrelid = confrelid
            ) AS parent_cols
        FROM pg_constraint
        WHERE contype = 'f'
    LOOP
        sql_text := format(
            'SELECT count(*) FROM %s c WHERE c.%I IS NOT NULL AND NOT EXISTS (SELECT 1 FROM %s p WHERE %s)',
            r.child_table,
            r.child_cols[1],
            r.parent_table,
            (SELECT string_agg(format('p.%I = c.%I', r.parent_cols[i], r.child_cols[i]), ' AND ')
             FROM generate_subscripts(r.child_cols, 1) AS i)
        );

        EXECUTE sql_text INTO orphan_count;

        IF orphan_count > 0 THEN
            RAISE NOTICE 'VIOLATION: % (%): % orphaned row(s) in % referencing %',
                r.conname, r.def, orphan_count, r.child_table, r.parent_table;
        END IF;
    END LOOP;
END $$;"""
            )
            # Rows are inserted with their legacy ids, so the identity sequences must be moved past them
            cursor.execute(
                """
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT table_name FROM information_schema.columns
        WHERE table_schema = 'public' AND column_name = 'id' AND is_identity = 'YES'
    LOOP
        EXECUTE format(
            'SELECT setval(pg_get_serial_sequence(%L, ''id''), COALESCE((SELECT MAX(id) FROM %I), 0) + 1, false)',
            r.table_name,
            r.table_name
        );
    END LOOP;
END $$;"""
            )
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            cursor.close()
    except psycopg.Error as e:
        tqdm.write(f"Failed to connect to PostgreSQL: {e}")
        raise
    finally:
        if conn:
            conn.close()


_read_connection: psycopg.Connection[TupleRow] | None = None


def get_read_cursor() -> psycopg.Cursor[TupleRow]:
    # Autocommit so each lookup sees the latest committed data and holds no locks between statements
    global _read_connection
    if _read_connection is None or _read_connection.closed:
        _read_connection = psycopg.connect(POSTGRES_URL, autocommit=True)
    return _read_connection.cursor()


def fetch_id(cursor: psycopg.Cursor[TupleRow]) -> int:
    row = cursor.fetchone()
    if row is None:
        raise RuntimeError("Expected a returned id")
    return row[0]


@contextmanager
def get_firebird_cursor() -> Generator[fdb.Cursor]:
    try:
        fb_con = fdb.connect(
            host=FB_HOST,
            database=FB_DATABASE,
            user=FB_USER,
            password=FB_PASSWORD,
            fb_library_name=project_root / "src" / "db" / "fbclient.dll",
            charset="win1252",
        )
        fb_cursor = fb_con.cursor()
    except fdb.DatabaseError:
        tqdm.write(f"Failed to connect to database at {FB_HOST=} {FB_DATABASE=}")
        sys.exit(1)

    try:
        yield fb_cursor
        fb_con.commit()
    except Exception:
        fb_con.rollback()
        raise
    finally:
        fb_cursor.close()
        fb_con.close()
