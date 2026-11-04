from datetime import datetime

import pyodbc
from tqdm import tqdm

from .firebird_fetch import is_unmigrated_articulo
from .postgres_utils import get_part_id_by_reference
from .raio_models import (
    RaioPart,
    RaioCoating,
    RaioCaracteristica,
    RaioProductionOrder,
    RaioMaterial,
)
from .connections import get_raio_cursor
from .logger import logger


def get_raio_part_by_reference(reference: str) -> RaioPart | None:
    with get_raio_cursor() as cursor:
        cursor.execute(
            # The RAIO database is case-insensitive, but references that differ in case are different parts
            "SELECT ref, path, material_quality, material_dimension, coating FROM Articles WHERE ref = ? COLLATE Modern_Spanish_CS_AS",
            (reference,),
        )
        row = cursor.fetchone()
    if not row:
        return None
    return RaioPart(
        ref=row[0],
        path=row[1],
        material_quality=row[2],
        material_dimension=row[3],
        coating=row[4],
    )


def get_raio_coatings() -> list[RaioCoating]:
    with get_raio_cursor() as cursor:
        cursor.execute("SELECT coating FROM Coatings")
        coatings = cursor.fetchall()
    return [RaioCoating(coating=coating[0]) for coating in coatings]


def get_raio_caracteristicas() -> list[RaioCaracteristica]:
    with get_raio_cursor() as cursor:
        cursor.execute("SELECT ref, char FROM Characteristics WHERE char != ''")
        raio_caracteristicas = cursor.fetchall()
        caracteristicas: list[RaioCaracteristica] = []
        for caracteristica in tqdm(raio_caracteristicas, desc="Fetch RAIO caracteristicas", dynamic_ncols=True):
            if not (part_id := get_part_id_by_reference(caracteristica[0])):
                if is_unmigrated_articulo(caracteristica[0]):
                    continue
                logger.warning(
                    f"Migrar RAIO caracteristicas: Part id not found for reference {caracteristica[0]}"
                )
                continue
            caracteristicas.append(
                RaioCaracteristica(part_id=part_id, char=caracteristica[1].strip())
            )
        return caracteristicas


def get_raio_production_orders() -> list[RaioProductionOrder]:
    with get_raio_cursor() as cursor:
        cursor.execute(
            "SELECT id, machine, client, spod, reference, quantity, description, "
            "date_order, date_finish, date_deliver, observations, counter, assigned, "
            "importance, finishid, bool_done, coating_status FROM [OF] ORDER BY id"
        )
        raio_production_orders = cursor.fetchall()
    return parse_production_orders(raio_production_orders)


def get_raio_active_production_orders() -> list[RaioProductionOrder]:
    with get_raio_cursor() as cursor:
        cursor.execute(
            "SELECT id, machine, client, spod, reference, quantity, description, "
            "date_order, date_finish, date_deliver, observations, counter, assigned, "
            "importance, finishid, bool_done, coating_status FROM [OF] WHERE bool_machining = 1"
        )
        raio_production_orders = cursor.fetchall()
    return parse_production_orders(raio_production_orders)


def parse_production_orders(production_order_rows: list[pyodbc.Row]) -> list[RaioProductionOrder]:
    production_orders: list[RaioProductionOrder] = []
    for production_order in production_order_rows:
        production_orders.append(
            RaioProductionOrder(
                id=production_order[0],
                machine=production_order[1],
                client=production_order[2],
                spod=production_order[3],
                reference=production_order[4],
                quantity=production_order[5],
                description=production_order[6],
                date_order=(
                    datetime.fromisoformat(production_order[7])
                    if production_order[7]
                    else None
                ),
                date_finish=(
                    datetime.fromisoformat(production_order[8])
                    if production_order[8]
                    else None
                ),
                date_deliver=(
                    datetime.fromisoformat(production_order[9])
                    if production_order[9]
                    else None
                ),
                observations=production_order[10],
                counter=production_order[11],
                assigned=production_order[12],
                importance=production_order[13],
                finishid=production_order[14],
                bool_done=production_order[15],
                coating_status=production_order[16],
            )
        )
    return production_orders


def get_raio_materials() -> list[RaioMaterial]:
    with get_raio_cursor() as cursor:
        cursor.execute("SELECT quality FROM Materials")
        materials = cursor.fetchall()
        return [RaioMaterial(quality=material[0]) for material in materials]
