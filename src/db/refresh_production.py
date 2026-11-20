# Run by refresh.cmd from the production folder: replaces the production data with a new Prisma + RAIO migration
import os
import shutil
import subprocess
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from tqdm import tqdm

PRODUCTION_PATH = Path(__file__).resolve().parents[2]
# Before main is imported, because connections reads its settings when it loads
load_dotenv(PRODUCTION_PATH / ".env")

from main import migrate  # noqa: E402
from migration_scripts.logger import LOG_PATH, clear_log  # noqa: E402

FOLDERS = ["BLUEPRINTS", "SELL_ORDERS", "TAGS", "DELIVERY_NOTES", "INVOICES"]
SERVICE = "ResanoRP"
DATABASE = os.environ["POSTGRES_DB"]
IMPORT_PATH = PRODUCTION_PATH / "import"


def run_pg(tool: str, *args: str | Path):
    subprocess.run(
        [
            PRODUCTION_PATH / "bin" / "postgres" / "bin" / tool,
            "-h",
            "localhost",
            "-p",
            os.environ["POSTGRES_PORT"],
            "-U",
            os.environ["POSTGRES_USER"],
            *args,
        ],
        check=True,
        env={**os.environ, "PGPASSWORD": os.environ["POSTGRES_PASSWORD"]},
    )


def psql(database: str, *args: str | Path):
    run_pg("psql", "-v", "ON_ERROR_STOP=1", "-q", "-d", database, *args)


def start():
    subprocess.run(["cmd", "/c", PRODUCTION_PATH / "start.cmd"], check=True)


def stop():
    if "STOPPED" not in subprocess.run(["sc", "query", SERVICE], capture_output=True, text=True).stdout:
        subprocess.run(["net", "stop", SERVICE], check=True)


def refresh(backup_path: Path):
    for folder in FOLDERS:
        if (PRODUCTION_PATH / folder).exists():
            shutil.move(PRODUCTION_PATH / folder, backup_path / folder)
        (PRODUCTION_PATH / folder).mkdir()

    # Dropping the databases also drops PowerSync's replication slot and stored rows, so it replicates the new data once
    psql(
        "postgres",
        "-c",
        f"DROP DATABASE IF EXISTS {DATABASE} WITH (FORCE)",
        "-c",
        "DROP DATABASE IF EXISTS powersync_storage WITH (FORCE)",
        "-c",
        f"CREATE DATABASE {DATABASE}",
    )
    psql(DATABASE, "-f", PRODUCTION_PATH / "powersync" / "init.sql")
    # From the bundle, not from the backup: production has no migrations, so the new version's schema comes from here
    psql(DATABASE, "-f", PRODUCTION_PATH / "schema.sql")

    clear_log()
    migrate()


def rollback(backup_path: Path):
    tqdm.write(f"Refresh failed, see {LOG_PATH}. Restoring {backup_path}")
    # start.cmd's import restores it, the same way restore.cmd does
    IMPORT_PATH.mkdir()
    shutil.copyfile(backup_path / "production.dump", IMPORT_PATH / "prisma.dump")
    for folder in FOLDERS:
        if (backup_path / folder).exists():
            shutil.move(backup_path / folder, IMPORT_PATH / folder)
    start()


def main():
    if IMPORT_PATH.exists():
        raise SystemExit(f"An import is already staged, remove {IMPORT_PATH} first")
    if input("Replace all production data with Prisma + RAIO? Type YES: ").strip() != "YES":
        raise SystemExit("Cancelled")

    backup_path = PRODUCTION_PATH / "backups" / datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_path.mkdir(parents=True)

    stop()
    try:
        run_pg("pg_dump", "-d", DATABASE, "-Fc", "-f", backup_path / "production.dump")
    except BaseException:
        start()
        raise
    tqdm.write(f"Production backed up to {backup_path}")

    try:
        refresh(backup_path)
    except BaseException:
        rollback(backup_path)
        raise

    start()
    tqdm.write(f"Production refreshed. The previous data is in {backup_path}")


if __name__ == "__main__":
    main()
