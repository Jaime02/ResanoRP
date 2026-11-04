import re
from collections import defaultdict
from decimal import ROUND_HALF_UP, Decimal
from functools import lru_cache

from . import OldRefToNewId
from .connections import get_firebird_cursor
from .logger import logger
from .secrets import IGNORED_PART_IDS, MERGED_PARTS
from .firebird_models import (
    FBArticulo,
    FBLinPedVenta,
    FBAlbaran,
    FBPedVenta,
    FBTarifa,
    FBPvpEspecial,
    FBCaracteristica,
    FBCliente,
    FBPago,
    FBFactura,
    FBLinAlbaran,
)


def round_price(precio: float) -> float:
    # The app holds prices with 3 decimals. Firebird keeps them as single precision floats, so 20.7 comes as 20.700001
    # and 0.0385 as 0.038499999, which round() would take down instead of up.
    return float(Decimal(f"{precio:.6f}").quantize(Decimal("0.001"), ROUND_HALF_UP))


# Prisma could not leave a price empty, so a price not calculated yet was typed as ones. 1111111111 is stored as
# 1111111168 because of the single precision.
PLACEHOLDER_PRICES = {111, 1111, 11111, 111111, 1111111, 11111111, 1111111168}

DEPRECATED_PART_REGEX = re.compile(r"(?<!NO )\bUSAR\s+([^\s()]+)")


def calculate_iban(ccc: str, country_code: str = "ES") -> str | None:
    # Convert country code to numbers (E=14, S=28)
    country_digits = "".join(str(ord(c) - 55) for c in country_code)
    # CCC + country code digits + '00'
    reformatted = f"{ccc}{country_digits}00"
    # Calculate check digits
    check_digits = 98 - (int(reformatted) % 97)
    iban = f"{country_code}{check_digits:02d}{ccc}"
    return iban if len(iban) == 24 else None


def fetch_articulos() -> list[FBArticulo]:
    with get_firebird_cursor() as cursor:
        cursor.execute("SELECT ID_ARTICULO, NOMBRE FROM ARTICULOS")
        articulos: list[FBArticulo] = []
        for row in cursor.fetchall():
            reference = row[0]
            description = row[1]
            if reference is not None and description is None:
                description = reference
            if not isinstance(reference, str) or not isinstance(description, str):
                raise Exception(f"Invalid articulo: {reference}, {description}")
            articulos.append(FBArticulo(reference, description))
        return articulos


@lru_cache(maxsize=None)
def get_articulo_references() -> set[str]:
    return {articulo.reference for articulo in fetch_articulos()}


@lru_cache(maxsize=None)
def get_replaced_articulo_references() -> dict[str, str]:
    # Deprecated Articulo reference -> reference of the Articulo that replaces it
    replacements: dict[str, str] = {}
    references_by_pedido = [{line.articulo for line in lines} for lines in fetch_lin_pedventas().values()]
    for articulo in fetch_articulos():
        deprecated_match = DEPRECATED_PART_REGEX.search(articulo.description)
        new_reference = MERGED_PARTS.get(articulo.reference) or (deprecated_match and deprecated_match.group(1))
        if not new_reference or new_reference == articulo.reference:
            continue
        if new_reference in IGNORED_PART_IDS or new_reference not in get_articulo_references():
            logger.warning(f"Articulo {articulo.reference} points to missing part reference {new_reference}")
            continue
        # A "USAR" description can point to a different revision, which is ordered with it as a separate line
        if any({articulo.reference, new_reference} <= references for references in references_by_pedido):
            logger.warning(f"Articulo {articulo.reference} is not merged into {new_reference}, a Pedido de venta has both")
            continue
        replacements[articulo.reference] = new_reference
    return replacements


def resolve_articulo_reference(reference: str) -> str:
    # A deprecated Articulo is not migrated, its usages go to the Articulo that replaces it, following chains
    replacements = get_replaced_articulo_references()
    seen = {reference}
    while (reference := replacements.get(reference, reference)) not in seen:
        seen.add(reference)
    return reference


def is_unmigrated_articulo(reference: str) -> bool:
    # Every Articulo is migrated unless it is ignored or unused, so one missing in the app was left out on purpose
    return reference in get_articulo_references()


def fetch_tarifas() -> list[FBTarifa]:
    with get_firebird_cursor() as cursor:
        cursor.execute(
            "SELECT t.ID_ARTICULO, t.PRECIO FROM ART_TARIFAS t WHERE t.ID_ARTICULO IN (SELECT ID_ARTICULO FROM ARTICULOS)"
        )
        tarifas: list[FBTarifa] = []
        for row in cursor.fetchall():
            articulo, precio = row
            if precio is None:
                continue
            tarifas.append(FBTarifa(articulo, round_price(precio)))
        return tarifas


def fetch_albaran(migrated_pagos_ids: OldRefToNewId) -> list[FBAlbaran]:
    with get_firebird_cursor() as cursor:
        cursor.execute(
            "SELECT ID_NUMERO, FECHA, CLIENTE, FORMAPAGO, SPEDIDO, FACTURA, FECHAFACTURA FROM CAB_ALBARAN"
        )
        albaranes: list[FBAlbaran] = []
        for row in cursor.fetchall():
            id_numero, fecha, cliente, formapago, spedido, factura, fechafactura = row
            if not isinstance(formapago, str):
                raise Exception(
                    f"Invalid 'formapago': expected str, got {type(formapago).__name__}"
                )
            formapago = migrated_pagos_ids.get(formapago)
            albaranes.append(
                FBAlbaran(
                    id_numero, fecha, cliente, formapago, spedido, factura, fechafactura
                )
            )
        return albaranes


def fetch_cab_pedventas(migrated_pagos_ids: OldRefToNewId) -> list[FBPedVenta]:
    with get_firebird_cursor() as cursor:
        cursor.execute(
            "SELECT ID_NUMERO, FECHA, CLIENTE, FORMAPAGO, SPEDIDO FROM CAB_PEDVENTAS"
        )
        ped_ventas: list[FBPedVenta] = []
        for row in cursor.fetchall():
            id_numero, fecha, cliente, formapago, spedido = row
            if cliente is None or spedido is None:
                continue
            formapago = migrated_pagos_ids.get(formapago)
            ped_ventas.append(FBPedVenta(id_numero, fecha, cliente, formapago, spedido))
        return ped_ventas


def fetch_lin_pedventas() -> defaultdict[int, list[FBLinPedVenta]]:
    with get_firebird_cursor() as cursor:
        cursor.execute(
            """
            SELECT ID_NUMERO,
                   ARTICULO,
                   DESCRIPCION,
                   CANTIDAD,
                   PRECIO,
                   IMPORTE,
                   F_ENTREGA,
                   PENDIENTES
            FROM LIN_PEDVENTAS
            WHERE ARTICULO IS NOT NULL
              AND CANTIDAD IS NOT NULL
            """
        )
        lineas: defaultdict[int, list[FBLinPedVenta]] = defaultdict(list)
        for row in cursor.fetchall():
            (
                sell_order_id,
                articulo,
                descripcion,
                cantidad,
                precio,
                importe,
                f_entrega,
                pendientes,
            ) = row
            if precio is None:
                precio = 0.0
            precio = round_price(precio)
            lineas[sell_order_id].append(
                FBLinPedVenta(
                    sell_order_id,
                    articulo,
                    descripcion,
                    cantidad,
                    None if precio in PLACEHOLDER_PRICES else precio,
                    importe,
                    f_entrega,
                    pendientes,
                )
            )
        return lineas


def fetch_caracteristicas() -> list[FBCaracteristica]:
    with get_firebird_cursor() as cursor:
        cursor.execute(
            "SELECT INDICE, ARTICULO, CARACTERISTICA FROM CARACTERISTICAS WHERE CARACTERISTICA IS NOT NULL ORDER BY INDICE"
        )
        return [
            FBCaracteristica(id, articulo, caracteristica.strip())
            for (id, articulo, caracteristica) in cursor.fetchall()
        ]


def fetch_clientes(migrated_pagos_ids: OldRefToNewId) -> list[FBCliente]:
    with get_firebird_cursor() as cursor:
        cursor.execute(
            """
            SELECT ID_CLIENTE,
                   NOMBRE,
                   NOMBREFISCAL,
                   DIRECCION,
                   LOCALIDAD,
                   PROVINCIA,
                   CODPOSTAL,
                   PAIS,
                   TELEFONO,
                   CIF,
                   FORMAPAGO,
                   CTACONTA,
                   CTABANCO,
                   CTASUCURSAL,
                   CTADC,
                   CTACTA
            FROM CLIENTES
            """
        )
        clients: list[FBCliente] = []
        for row in cursor.fetchall():
            (
                id,
                nombre,
                nombrefiscal,
                direccion,
                localidad,
                provincia,
                codpostal,
                pais,
                telefono,
                cif,
                formapago,
                ctaconta,
                *banco,
            ) = row
            if pais is None:
                pais = "ESPAÑA"
            if provincia is None:
                provincia = localidad
            iban = None
            if all(x is not None for x in banco):
                iban = calculate_iban("".join(banco))
            formapago = migrated_pagos_ids.get(formapago)
            if telefono:
                telefono = telefono.replace(" ", "").replace("-", "")
            clients.append(
                FBCliente(
                    id,
                    nombre,
                    nombrefiscal,
                    direccion,
                    localidad,
                    provincia,
                    codpostal,
                    pais,
                    telefono,
                    cif,
                    formapago,
                    iban,
                    ctaconta.strip() if ctaconta and ctaconta.strip() else None,
                )
            )
        return clients


def fetch_pagos() -> list[FBPago]:
    with get_firebird_cursor() as cursor:
        cursor.execute("SELECT ID_PAGOS, NOMBRE, DIAS_PRIMER_VTO, N_RECIBOS FROM PAGOS")
        return [
            FBPago(id, nombre, dias, (n_recibos or 0) >= 1)
            for (id, nombre, dias, n_recibos) in cursor.fetchall()
        ]


def fetch_facturas(migrated_pagos_ids: OldRefToNewId) -> list[FBFactura]:
    with get_firebird_cursor() as cursor:
        cursor.execute(
            "SELECT f.ID_FACTURA, f.FECHA, f.FORMAPAGO, f.CLIENTE, f.IMPORTES, f.TOTAL, f.CONTABILIZADO, r.VENCIMIENTO "
            "FROM FACTURAS f LEFT JOIN RECIBOS r ON r.ID_RECIBO = f.ID_FACTURA AND r.NUMERO = 1"
        )
        facturas: list[FBFactura] = []
        for row in cursor.fetchall():
            id, fecha, formapago, cliente, importes, total, contabilizado, vencimiento = row
            if fecha is None:
                continue
            contabilizado = contabilizado == "S"
            formapago = migrated_pagos_ids.get(formapago)
            facturas.append(
                FBFactura(
                    id,
                    fecha,
                    formapago,
                    cliente,
                    importes,
                    total,
                    contabilizado,
                    vencimiento,
                )
            )
        return facturas


def fetch_pvpespeciales() -> list[FBPvpEspecial]:
    with get_firebird_cursor() as cursor:
        cursor.execute(
            "SELECT CLIENTE, ARTICULO, DESDELOTE, PRECIO FROM PVPESPECIALES WHERE PRECIO IS NOT NULL"
        )
        return [
            FBPvpEspecial(cliente, articulo, int(lote), round_price(precio))
            for (cliente, articulo, lote, precio) in cursor.fetchall()
        ]


def fetch_recibos():
    """
    # TODO Add recibos to the DB
    fb_cursor.execute(
        "SELECT ID_RECIBO, FECHA, FORMAPAGO, CLIENTE, VENCIMIENTO, IMPORTE FROM RECIBOS")
    return fb_cursor.fetchall()
    """
    ...


def get_id_pago_by_fb_id(fb_id_pago: str) -> int:
    with get_firebird_cursor() as cursor:
        cursor.execute("SELECT ID_PAGOS FROM PAGOS WHERE ID_PAGOS = ?", (fb_id_pago,))
        row = cursor.fetchone()
        if row is None:
            raise Exception(f"Pago not found: {fb_id_pago}")
        return row[0]


def get_lineas_albaran() -> defaultdict[int, list[FBLinAlbaran]]:
    with get_firebird_cursor() as cursor:
        cursor.execute(
            """
            SELECT M.DOCUMENTO, M.TERCERO, M.ARTICULO, M.CANTIDAD, M.PRECIO, M.DESCRIPCION, M.PEDIDO, M.NSERIE
            FROM MOVIMIENTOS M
            WHERE M.origen = 'ALB'
            AND M.DESCRIPCION is not null AND M.DOCUMENTO is not null
            ORDER BY M.DOCUMENTO, M.LINEA
            """
        )
        lineas: defaultdict[int, list[FBLinAlbaran]] = defaultdict(list)
        for documento, cliente, articulo, cantidad, precio, descripcion, id_pedido, referencia_pedido_cliente in cursor.fetchall():
            id_albaran = int(documento)
            lineas[id_albaran].append(
                FBLinAlbaran(
                    cliente,
                    articulo,
                    int(cantidad),
                    round_price(precio),
                    id_albaran,
                    descripcion,
                    id_pedido,
                    referencia_pedido_cliente,
                )
            )
        return lineas
