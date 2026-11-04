import re
from dataclasses import dataclass

from psycopg import Cursor, sql
from psycopg.rows import TupleRow

from migration_scripts.secrets import SHAPE_ID_BY_LETTER


@dataclass
class ParsedDimensions:
    width: float
    shape_id: int | None


def parse_part_dimensions(dimensions: str | None) -> ParsedDimensions | None:
    if not dimensions:
        return None
    pattern = r"^([A-Z]+)(\d+(?:[.,]\d+)?)"
    match = re.search(pattern, dimensions.strip())
    if not match:
        # print("Failed to parse part dimensions: '" + dimensions + "'")
        return None
    prefix = match.group(1)
    # Standardizing number by replacing comma with period for float conversion if needed
    width = float(match.group(2).replace(",", "."))
    shape_id = SHAPE_ID_BY_LETTER.get(prefix)
    return ParsedDimensions(width=width, shape_id=shape_id)


def clear_postgres_table(cursor: Cursor[TupleRow], table_name: str, reset_id: bool = True):
    cursor.execute(sql.SQL("DELETE FROM {}").format(sql.Identifier(table_name)))
    if reset_id:
        cursor.execute(sql.SQL("ALTER SEQUENCE {} RESTART WITH 1").format(sql.Identifier(f"{table_name}_id_seq")))
