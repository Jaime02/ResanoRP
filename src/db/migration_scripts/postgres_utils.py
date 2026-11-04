import re
from functools import lru_cache

from migration_scripts.firebird_fetch import resolve_articulo_reference
from migration_scripts.logger import logger
from migration_scripts.secrets import IGNORED_PART_IDS

from migration_scripts.connections import get_read_cursor as get_postgres_cursor


@lru_cache(maxsize=None)
def get_part_references_by_sell_order_id(sell_order_id: int) -> list[str]:
    with get_postgres_cursor() as cursor:
        cursor.execute(
            "SELECT PR.reference FROM sell_order SO "
            'JOIN sell_order_line SOL ON SO.id = SOL."sellOrderId" '
            'JOIN part_reference PR ON SOL."partReferenceId" = PR.id '
            "WHERE SO.id = %s",
            (sell_order_id,),
        )
        return list(map(lambda so: so[0], cursor.fetchall()))


@lru_cache(maxsize=None)
def get_part_id_by_reference(reference: str) -> int | None:
    # Not resolved, so the prices and features of a deprecated Articulo are dropped and its part keeps those of the
    # Articulo that replaces it
    with get_postgres_cursor() as cursor:
        cursor.execute(
            'SELECT DISTINCT P."id" FROM part_reference PR JOIN Part P ON PR."partId" = P."id" WHERE PR."reference" = %s',
            (reference,),
        )
        result = cursor.fetchall()
        if len(result) > 1:
            raise Exception(f"Multiple parts found for reference {reference}")
        if len(result) == 1:
            return result[0][0]
        return None


def get_sell_order_line_id(sell_order_id: int, reference: str) -> int | None:
    with get_postgres_cursor() as cursor:
        cursor.execute(
            'SELECT SOL."id" FROM sell_order_line SOL '
            'JOIN part_reference PR ON SOL."partReferenceId" = PR."id" '
            'WHERE SOL."sellOrderId" = %s AND PR."reference" = %s',
            (sell_order_id, resolve_articulo_reference(reference)),
        )
        row = cursor.fetchone()
        return int(row[0]) if row else None


def get_sell_order_line_id_by_client_reference(
    sell_order_client_reference: str, reference: str
) -> int | None:
    if not sell_order_client_reference:
        raise Exception(
            f"Invalid sell order client reference: '{sell_order_client_reference}'"
        )
    if not reference:
        raise Exception(f"Invalid part reference: {reference}")
    reference = resolve_articulo_reference(reference)

    with get_postgres_cursor() as cursor:
        cursor.execute(
            'SELECT SO."id", SO."clientReference" FROM sell_order SO WHERE SO."clientReference" LIKE %s',
            (f"{sell_order_client_reference}%",),
        )
        possible_sell_orders = cursor.fetchall()

        escaped_ref = re.escape(sell_order_client_reference)

        # This matches: "REF" OR "REF / <date>"
        pattern = rf"^{escaped_ref}(\s/\s\d{{2}}/\d{{2}}/\d{{4}})?$"

        filtered_sell_orders = [
            row for row in possible_sell_orders if re.match(pattern, row[1])
        ]
        sell_orders_ids_with_the_reference = list(
            map(lambda so: int(so[0]), filtered_sell_orders)
        )

        sell_order_ids = list(
            filter(
                lambda so_id: reference in get_part_references_by_sell_order_id(so_id),
                sell_orders_ids_with_the_reference,
            )
        )

        if len(sell_order_ids) > 1:
            logger.warning(
                f"Multiple Sell orders found for sell order reference {sell_order_client_reference} and part reference {reference}. Found sell orders: {sell_order_ids}"
            )
            return sell_order_ids[0]
        if len(sell_order_ids) == 0:
            return None
        sell_order_id = sell_order_ids[0]

        cursor.execute(
            """
            SELECT SOL."id"
            FROM sell_order_line SOL
                     JOIN part_reference PR ON SOL."partReferenceId" = PR."id"
            WHERE SOL."sellOrderId" = %s
              AND PR."reference" = %s
            """,
            (sell_order_id, reference),
        )
        row = cursor.fetchone()
        return int(row[0]) if row else None


@lru_cache(maxsize=None)
def get_part_reference_id_by_reference(reference: str) -> int | None:
    if reference in IGNORED_PART_IDS:
        return None
    with get_postgres_cursor() as cursor:
        cursor.execute(
            'SELECT id FROM part_reference WHERE "reference" = %s', (resolve_articulo_reference(reference),)
        )
        result = cursor.fetchall()
        if len(result) > 1:
            raise Exception(f"Multiple parts found for reference {reference}")
        if len(result) == 0:
            return None
        return result[0][0]


def get_custom_sell_order_line_id(descripcion: str, id_pedido: int) -> int | None:
    with get_postgres_cursor() as cursor:
        cursor.execute(
            'SELECT id FROM sell_order_line WHERE "partReferenceId" IS NULL AND "description" = %s AND "sellOrderId" = %s',
            (descripcion, id_pedido),
        )
        result = cursor.fetchall()
        if len(result) > 1:
            raise Exception(f"Multiple parts found for reference {descripcion}")
        if len(result) == 0:
            return None
        return result[0][0]
