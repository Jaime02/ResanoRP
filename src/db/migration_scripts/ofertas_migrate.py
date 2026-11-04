import re
from collections import defaultdict
from collections.abc import Sequence
from datetime import date
from functools import lru_cache
from pathlib import Path

from python_calamine import CalamineError, CalamineWorkbook
from tqdm import tqdm

from .connections import get_postgres_cursor, require_env
from .logger import logger
from .secrets import IGNORE_CLIENTES, OFERTAS_FOLDER_TO_CLIENT_NAME
from .utils import clear_postgres_table

OFERTAS_ROOT_PATH = Path(require_env("OFERTAS_ROOT_PATH"))
if not OFERTAS_ROOT_PATH.exists():
    raise Exception(f"OFERTAS_ROOT_PATH does not exist: {OFERTAS_ROOT_PATH}")

# Row (0-based) and expected label prefix in column A of the "DATOS" sheet
OFERTA_TEMPLATE_LABELS = {
    0: "FECHA",
    2: "REFERENCIA",
    11: "mm long.",
    12: "DESPEDICIO %",
    16: "COSTO MATERIAL",
    21: "PUESTA",
    22: "PIEZAS HORA",
    23: "% IMPREVISTOS",
    24: "TRANSPORTE",
    26: "PRECIO HORA",
    37: "COSTO OTROS",
}

# Sizes like 5X10, R16X202 or RE12XM8X14 describe many parts, not one
DIMENSION_PATTERN = re.compile(r"^[A-Z]{0,2}\d+([.,]\d+)?(X[A-Z]{0,2}\d+([.,]\d+)?)+$")


Rows = Sequence[Sequence[object]]


def get_cell(rows: Rows, row: int, col: int) -> object:
    return rows[row][col] if row < len(rows) and col < len(rows[row]) else ""


def get_number(rows: Rows, row: int, col: int) -> float | None:
    value = get_cell(rows, row, col)
    return float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else None


# The sheets keep the full precision of their formulas, but the app only accepts the decimals of its inputs
def round_or_none(value: float | None, decimals: int) -> float | None:
    return None if value is None else round(value, decimals)


def to_percentage(value: float | None) -> float | None:
    return round_or_none(None if value is None else value * 100, 2)


def get_reference(value: object) -> str:
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


@lru_cache(maxsize=None)
def get_clients() -> list[tuple[int, str]]:
    with get_postgres_cursor() as cursor:
        cursor.execute("SELECT id, name FROM client")
        return cursor.fetchall()


@lru_cache(maxsize=None)
def get_part_references() -> dict[str, list[tuple[int, int | None]]]:
    with get_postgres_cursor() as cursor:
        cursor.execute('SELECT reference, "partId", "clientId" FROM part_reference')
        part_references: defaultdict[str, list[tuple[int, int | None]]] = defaultdict(list)
        for reference, part_id, client_id in cursor.fetchall():
            part_references[reference].append((part_id, client_id))
        return dict(part_references)


@lru_cache(maxsize=None)
def get_normalized_part_references() -> dict[str, list[tuple[int, int | None]]]:
    part_references: defaultdict[str, list[tuple[int, int | None]]] = defaultdict(list)
    for reference, items in get_part_references().items():
        part_references[normalize_reference(reference)].extend(items)
    return dict(part_references)


def normalize_reference(reference: str) -> str:
    # References that differ in case are different parts
    return re.sub(r"[^A-Za-z0-9Øø]", "", reference).lstrip("0")


def is_code_like(reference: str) -> bool:
    return (
        len(re.findall(r"\d", reference)) >= 3
        and len(normalize_reference(reference)) >= 4
        and not DIMENSION_PATTERN.match(re.sub(r"\s", "", reference.upper()))
    )


def get_client_id(client_name: str | None) -> int | None:
    if client_name is None:
        return None
    client_ids = [
        id
        for id, name in get_clients()
        if name.lower().startswith(client_name.lower()) and "no usar" not in name.lower()
    ]
    if not client_ids:
        return None
    if len(client_ids) > 1:
        raise Exception(f"Multiple clients found for '{client_name}': {client_ids}")
    return client_ids[0]


def get_oferta_part_id(references: list[str], client_id: int | None) -> int | None:
    for reference in references:
        lookups = [(get_part_references(), reference)]
        if is_code_like(reference):
            lookups.append((get_normalized_part_references(), normalize_reference(reference)))
        for part_references, key in lookups:
            part_ids = {
                part_id
                for part_id, reference_client_id in part_references.get(key, [])
                if client_id is None or reference_client_id in (client_id, None)
            }
            if len(part_ids) == 1:
                return part_ids.pop()
            if len(part_ids) > 1:
                logger.warning(f"Oferta: multiple parts found for reference {reference}: {sorted(part_ids)}")
                return None
    return None


OfertaValues = tuple[
    float | None, int, int, float | None, int, float, int, float | None, float | None, float | None, float
]


def parse_oferta(path: Path, client_id: int | None) -> tuple[date, OfertaValues] | None:
    try:
        rows: Rows = CalamineWorkbook.from_path(path).get_sheet_by_name("DATOS").to_python(skip_empty_area=False)
    except CalamineError as e:
        # logger.warning(f"Oferta: could not read {path}: {e}")
        return None

    if not all(str(get_cell(rows, row, 0)).startswith(label) for row, label in OFERTA_TEMPLATE_LABELS.items()):
        # logger.warning(f"Oferta: unknown template {path}")
        return None

    stem = path.stem.strip()
    stem_without_copy = re.sub(r"\s*\(\d+\)$", "", stem)
    first_token = (re.match(r"[^\s(]*", stem) or [""])[0]
    # The file name is more reliable than the reference written inside the sheet
    references = [
        stem,
        stem_without_copy,
        stem.replace(" ", ""),
        first_token if is_code_like(first_token) else "",
        get_reference(get_cell(rows, 2, 1)),
    ]
    references += [reference.translate(str.maketrans(",.", ".,")) for reference in references]
    references = list(dict.fromkeys(reference for reference in references if reference))
    if not (part_id := get_oferta_part_id(references, client_id)):
        # logger.warning(f"Oferta: part not found for {path}")
        return None

    part_length = get_number(rows, 11, 1)
    waste = get_number(rows, 12, 1)
    setup_minutes = get_number(rows, 21, 1)
    parts_per_hour = get_number(rows, 22, 1)
    price_per_hour = get_number(rows, 26, 1)
    if (
        part_length is None
        or waste is None
        or setup_minutes is None
        or parts_per_hour is None
        or price_per_hour is None
    ):
        logger.warning(f"Oferta: missing required values in {path}")
        return None

    coating_cost = get_number(rows, 33, 3) if str(get_cell(rows, 33, 0)).strip() == "ZINCADO" else None
    other_cost = (get_number(rows, 37, 3) or 0.0) - (coating_cost or 0.0)

    offer_date = get_cell(rows, 0, 1)
    return offer_date if isinstance(offer_date, date) else date.min, (
        round_or_none(coating_cost, 3) or None,
        round(price_per_hour),
        round(setup_minutes),
        round_or_none(get_number(rows, 16, 3), 3),
        part_id,
        round(part_length, 2),
        round(parts_per_hour),
        round(other_cost, 3) or None,
        to_percentage(get_number(rows, 24, 1)),
        to_percentage(get_number(rows, 23, 1)),
        round(waste * 100, 2),
    )


def migrate_ofertas():
    unknown_folders = [
        folder.name
        for folder in OFERTAS_ROOT_PATH.iterdir()
        if folder.is_dir() and folder.name not in IGNORE_CLIENTES and folder.name not in OFERTAS_FOLDER_TO_CLIENT_NAME
    ]
    if unknown_folders:
        raise Exception(f"Ofertas folders missing in OFERTAS_FOLDER_TO_CLIENT_NAME: {unknown_folders}")

    ofertas: list[tuple[date, OfertaValues]] = []
    total = 0
    for folder_name, client_name in tqdm(
        OFERTAS_FOLDER_TO_CLIENT_NAME.items(), desc="Parse ofertas folders", dynamic_ncols=True
    ):
        client_id = get_client_id(client_name)
        # Clientes without Pedidos de venta or Albaranes are not migrated
        if client_name and not client_id:
            logger.warning(f"Ofertas: client '{client_name}' not found, skipping folder {folder_name}")
            continue
        for path in (OFERTAS_ROOT_PATH / folder_name).glob("*.xls*"):
            if "copia" in path.name.lower():
                continue
            total += 1
            if oferta := parse_oferta(path, client_id):
                ofertas.append(oferta)
    tqdm.write(f"Parsed {len(ofertas)} / {total} ofertas")

    # Sorted by date so the newest oferta of each part wins the upsert
    ofertas.sort(key=lambda oferta: oferta[0])

    with get_postgres_cursor() as postgres_cursor:
        clear_postgres_table(postgres_cursor, "part_price_estimator", reset_id=False)
        for _, values in tqdm(ofertas, desc="Ofertas", dynamic_ncols=True):
            postgres_cursor.execute(
                'INSERT INTO part_price_estimator ("coatingCost", "machinePricePerHour", "machineSetupTimeMinutes", "materialCost", "partId", '
                '"partLength", "partsPerHour", "otherCost", "transportPercentage", "unexpectedPercentage", "wastePercentage") '
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) "
                'ON CONFLICT ("partId") DO UPDATE SET '
                '"coatingCost" = EXCLUDED."coatingCost", "machinePricePerHour" = EXCLUDED."machinePricePerHour", '
                '"machineSetupTimeMinutes" = EXCLUDED."machineSetupTimeMinutes", "materialCost" = EXCLUDED."materialCost", '
                '"partLength" = EXCLUDED."partLength", "partsPerHour" = EXCLUDED."partsPerHour", "otherCost" = EXCLUDED."otherCost", '
                '"transportPercentage" = EXCLUDED."transportPercentage", "unexpectedPercentage" = EXCLUDED."unexpectedPercentage", '
                '"wastePercentage" = EXCLUDED."wastePercentage"',
                values,
            )
