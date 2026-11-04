# python -m utils.load_raio_sql
import re
from pathlib import Path
from dotenv import load_dotenv
from migration_scripts.connections import RAIO_DATABASE, get_raio_cursor, require_env

project_root = Path(__file__).parent.parent.parent.parent
load_dotenv((project_root / "envs" / ".env.prisma").resolve())

data_files = [
    f"{table}_*.sql"
    for table in ("Materials", "Coatings", "Machines", "Misc", "Clients", "CrossCheck", "Articles", "_Characteristics_", "_OF_")
]


def load_raio_sql():
    sql_dir = project_root / require_env("RAIO_DATABASE")

    with get_raio_cursor("master") as cursor:
        cursor.execute(f"IF DB_ID('{RAIO_DATABASE}') IS NOT NULL BEGIN ALTER DATABASE [{RAIO_DATABASE}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [{RAIO_DATABASE}]; END")
        cursor.execute(f"CREATE DATABASE [{RAIO_DATABASE}] COLLATE Modern_Spanish_CI_AS")

    with get_raio_cursor() as cursor:
        # The export names the database RAIO and tries to create the schema that already exists
        schema = (sql_dir / "schema.sql").read_text(encoding="utf-8-sig").replace("CREATE SCHEMA dbo;", "")
        cursor.execute(re.sub(r"\bRAIO\.dbo\.", "dbo.", schema))
        for pattern in data_files:
            for file in sql_dir.glob(pattern):
                print(f"Loading {file.name}...")
                script = re.sub(r"\bRAIO\.dbo\.", "dbo.", file.read_text(encoding="utf-8-sig"))
                cursor.execute(script)
    print("Database loaded successfully!")


if __name__ == "__main__":
    load_raio_sql()
