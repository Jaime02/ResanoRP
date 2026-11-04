import re
import shutil
from collections import defaultdict
from decimal import Decimal
from functools import lru_cache
from math import ceil
from pathlib import Path

from tqdm import tqdm

from . import IdMap
from .connections import fetch_id, get_postgres_cursor, get_read_cursor, project_root, require_env
from .logger import logger
from .firebird_fetch import *
from .models import Material
from .raio_fetch import get_raio_part_by_reference
from .raio_models import RaioPart
from .secrets import (
    IGNORED_CLIENT_IDS,
    IGNORED_PART_IDS,
    MERGED_CLIENTS,
    MERGED_PAYMENT_METHODS,
)
from .postgres_utils import (
    get_sell_order_line_id,
    get_sell_order_line_id_by_client_reference,
    get_part_reference_id_by_reference,
    get_part_id_by_reference,
    get_custom_sell_order_line_id,
)
from .utils import parse_part_dimensions, ParsedDimensions, clear_postgres_table

current_client_id = 1
client_name_to_new_id: OldRefToNewId = {}


def assign_client_id(
    client_id_map: IdMap, old_client_id: int, client_name: str
) -> int | None:
    # Assign a new client ID based on the old one and the client name
    # Returns the new ID if it did not exist before
    # Returns None if it was already assigned.
    global current_client_id

    if client_name in client_name_to_new_id:
        # Client name already exists, so it was already assigned a new ID
        new_id = client_name_to_new_id[client_name]
        client_id_map[old_client_id] = new_id
        return None

    # Client name is new, assign a new ID
    new_id = current_client_id
    client_name_to_new_id[client_name] = new_id
    client_id_map[old_client_id] = new_id
    current_client_id += 1
    return new_id


def get_new_client_id(client_id_map: IdMap, old_client_id: int) -> int | None:
    # Get the new client ID based on the old one
    if old_client_id not in client_id_map and old_client_id not in IGNORED_CLIENT_IDS:
        logger.warning(f"Old client id not found: {old_client_id}")
        return None
    return client_id_map[old_client_id]


def find_folder_by_id(base_dir: str, folder_id: int) -> str | None:
    base_path = Path(base_dir)
    if not base_path.is_dir():
        return None
    for entry in base_path.iterdir():
        if not entry.is_dir():
            continue
        match = re.match(r"^(\d+)\b", entry.name)
        if match and int(match.group(1)) == folder_id:
            return str(entry)
    return None


def match_part_material(
    raio_part: RaioPart,
    parsed_dimensions: ParsedDimensions,
    raw_materials: OldRefToNewId,
    materials: list[Material],
) -> int | None:
    for material in materials:
        if material.width != ceil(parsed_dimensions.width) or raw_materials.get(
            raio_part.material_quality or ""
        ) != material.rawMaterialId:
            continue
        return material.id
    return None


@lru_cache(maxsize=None)
def get_used_clientes_and_articulos() -> tuple[set[int], set[str]]:
    # Only Clientes with a Pedido de venta, Albarán or Factura, and Articulos in the lines of a Pedido de venta or
    # Albarán, are migrated. Prisma has no lines in Facturas, their Articulos are those of their Albaranes.
    # The pagos are only needed to map formapago, which is not used here
    ped_ventas = [p for p in fetch_cab_pedventas({}) if p.cliente not in IGNORED_CLIENT_IDS]
    albaranes = [a for a in fetch_albaran({}) if a.cliente not in IGNORED_CLIENT_IDS]
    lin_pedventas = fetch_lin_pedventas()
    lineas_albaran = get_lineas_albaran()
    clientes = (
        {p.cliente for p in ped_ventas}
        | {a.cliente for a in albaranes}
        | {f.cliente for f in fetch_facturas({}) if f.cliente not in IGNORED_CLIENT_IDS}
    )
    articulos = {line.articulo for p in ped_ventas for line in lin_pedventas.get(p.id, [])} | {
        line.articulo for a in albaranes for line in lineas_albaran.get(a.id, []) if line.articulo
    }
    return clientes, articulos


def firebird_migrate_articulos(
    migrated_coatings: OldRefToNewId,
    raw_materials: OldRefToNewId,
    materials: list[Material],
):
    used_references = {resolve_articulo_reference(reference) for reference in get_used_clientes_and_articulos()[1]}
    articulos = [
        a for a in fetch_articulos() if a.reference in used_references and a.reference not in IGNORED_PART_IDS
    ]
    tqdm.write(f"Found {len(articulos)} articulos")

    blueprint_root_path = (project_root / require_env("BLUEPRINT_ROOT_PATH")).resolve()
    raio_blueprint_root_path = Path(require_env("RAIO_BLUEPRINT_ROOT_PATH"))
    if blueprint_root_path.exists():
        shutil.rmtree(blueprint_root_path)

    with get_postgres_cursor() as postgres_cursor:
        clear_postgres_table(postgres_cursor, "part")
        clear_postgres_table(postgres_cursor, "part_reference")
        clear_postgres_table(postgres_cursor, "blueprint")

        for articulo in tqdm(articulos, desc="Articulos", dynamic_ncols=True):
            if raio_part := get_raio_part_by_reference(articulo.reference):
                coating_id = (
                    migrated_coatings[raio_part.coating] if raio_part.coating else None
                )
                parsed_dimensions = parse_part_dimensions(raio_part.material_dimension)
                if parsed_dimensions:
                    postgres_cursor.execute(
                        'INSERT INTO part ("description", "width", "shapeId", "coatingId") VALUES (%s, %s, %s, %s) RETURNING id',
                        (
                            articulo.description,
                            parsed_dimensions.width,
                            parsed_dimensions.shape_id,
                            coating_id,
                        ),
                    )
                    part_id = fetch_id(postgres_cursor)

                    if part_material_id := match_part_material(
                        raio_part, parsed_dimensions, raw_materials, materials
                    ):
                        postgres_cursor.execute(
                            'INSERT INTO part_material ("materialId", "partId") VALUES (%s, %s)',
                            (part_material_id, part_id),
                        )
                else:
                    postgres_cursor.execute(
                        'INSERT INTO part ("description", "coatingId") VALUES (%s, %s) RETURNING id',
                        (articulo.description, coating_id),
                    )
                    part_id = fetch_id(postgres_cursor)

                if raio_part.path:
                    file_name = Path(raio_part.path).stem
                    blueprint_relative_path = Path(*Path(raio_part.path).parts[2:])

                    source_path = raio_blueprint_root_path / blueprint_relative_path
                    if source_path.exists():
                        # Windows strips trailing spaces/dots from folder names and rejects these chars
                        folder_name = re.sub(
                            r'[<>:"/\\|?*]', "_", f"{part_id} - {articulo.description}"
                        ).rstrip(" .")
                        destination_path = (
                            blueprint_root_path / folder_name / f"{file_name}.pdf"
                        )

                        destination_path.parent.mkdir(parents=True, exist_ok=True)
                        shutil.copyfile(source_path, destination_path)

                        postgres_cursor.execute(
                            'INSERT INTO blueprint ("partId", "fileName") VALUES (%s, %s)',
                            (part_id, file_name),
                        )
                    else:
                        logger.warning(f"Blueprint for '{part_id}' not found at '{source_path}'")
                        pass
            else:
                postgres_cursor.execute(
                    'INSERT INTO part ("description") VALUES(%s) RETURNING id',
                    (articulo.description,),
                )
                part_id = fetch_id(postgres_cursor)

            postgres_cursor.execute(
                'INSERT INTO part_reference ("reference", "partId", "clientDescription") VALUES (%s, %s, %s)',
                (articulo.reference, part_id, articulo.description),
            )


def firebird_migrate_tarifas():
    tarifas = fetch_tarifas()
    tqdm.write(f"Found {len(tarifas)} tarifas")
    with get_postgres_cursor() as postgres_cursor:
        for tarifa in tqdm(tarifas, desc="Tarifas", dynamic_ncols=True):
            part_id = get_part_id_by_reference(tarifa.articulo)
            if part_id:
                postgres_cursor.execute(
                    'INSERT INTO part_price ("price", "partId") VALUES (%s, %s)',
                    (tarifa.price, part_id),
                )
            elif not is_unmigrated_articulo(tarifa.articulo):
                logger.warning(f"Tarifa no encontrada para articulo {tarifa.articulo}")


def firebird_migrate_albaran(migrated_pagos_ids: OldRefToNewId, client_id_map: IdMap):
    albaranes = fetch_albaran(migrated_pagos_ids)
    lineas_albaran = get_lineas_albaran()
    with get_postgres_cursor() as postgres_cursor:
        clear_postgres_table(postgres_cursor, "delivery_note")
        clear_postgres_table(postgres_cursor, "delivery_note_line")
        reset_part_reference_clients(postgres_cursor)
        # The lookups use the read connection, which only sees the reset references once committed
        postgres_cursor.connection.commit()
        postgres_cursor.execute('SELECT "vatPercentage" FROM configuration LIMIT 1')
        vat_percentage = (row := postgres_cursor.fetchone()) and row[0]
        albaran_prices_by_sell_order_line_id: defaultdict[int, set[float]] = defaultdict(set)
        for albaran in tqdm(albaranes, desc="Albaranes", dynamic_ncols=True):
            if albaran.cliente in IGNORED_CLIENT_IDS:
                continue
            new_client_id = get_new_client_id(client_id_map, albaran.cliente)
            if not new_client_id:
                raise Exception(
                    f"Client ID not found: {albaran.cliente} in {client_id_map}"
                )
            postgres_cursor.execute(
                'INSERT INTO delivery_note ("id", "deliveryDate", "clientId", "invoiceId", "createdAt") VALUES (%s, %s, %s, %s, %s)',
                (
                    albaran.id,
                    albaran.fecha,
                    new_client_id,
                    albaran.factura,
                    albaran.fecha,
                ),
            )
            delivery_note_lines = lineas_albaran.get(albaran.id, [])
            for delivery_note_line in delivery_note_lines:
                # The app does not allow a quantity of 0, Prisma used these lines as notes
                if delivery_note_line.cantidad == 0:
                    continue
                sell_order_line_id = None
                if delivery_note_line.id_pedido and delivery_note_line.articulo:
                    sell_order_line_id = get_sell_order_line_id(
                        delivery_note_line.id_pedido,
                        delivery_note_line.articulo,
                    )
                if (
                    not sell_order_line_id
                    and delivery_note_line.referencia_pedido_cliente
                    and delivery_note_line.articulo
                ):
                    sell_order_line_id = get_sell_order_line_id_by_client_reference(
                        delivery_note_line.referencia_pedido_cliente,
                        delivery_note_line.articulo,
                    )

                if not sell_order_line_id and delivery_note_line.id_pedido:
                    sell_order_line_id = get_custom_sell_order_line_id(
                        delivery_note_line.descripcion,
                        delivery_note_line.id_pedido,
                    )
                # An invoiced Albarán was charged at its price, even when it looks like a placeholder
                unit_price = (
                    None
                    if delivery_note_line.precio in PLACEHOLDER_PRICES and not albaran.factura
                    else delivery_note_line.precio
                )
                if sell_order_line_id and unit_price is not None:
                    albaran_prices_by_sell_order_line_id[sell_order_line_id].add(unit_price)
                postgres_cursor.execute(
                    'INSERT INTO delivery_note_line ("quantity", "description", "partReferenceId", "deliveryNoteId", "sellOrderLineId", "unitPrice", "vatPercentage")'
                    "VALUES (%s, %s, %s, %s, %s, %s, %s)",
                    (
                        delivery_note_line.cantidad,
                        delivery_note_line.descripcion,
                        get_part_reference_id_by_reference(delivery_note_line.articulo)
                        if delivery_note_line.articulo
                        else None,
                        albaran.id,
                        sell_order_line_id,
                        unit_price,
                        vat_percentage,
                    ),
                )
        # The tables were analyzed while empty after the commit above, which makes the planner nest loops over every line
        postgres_cursor.execute("ANALYZE delivery_note, delivery_note_line")
        assign_part_reference_clients(postgres_cursor)
        price_sell_order_lines_from_albaranes(postgres_cursor, albaran_prices_by_sell_order_line_id)
        # Prisma priced each Albarán on its own. A Línea keeps its price only where it differs from its Pedido de venta,
        # so the rest follow a later change of the price of the Pedido de venta
        postgres_cursor.execute(
            'UPDATE delivery_note_line DNL SET "unitPrice" = NULL FROM sell_order_line SOL '
            'WHERE SOL.id = DNL."sellOrderLineId" AND DNL."unitPrice" = SOL."partPrice"'
        )
    check_invoice_amounts(migrated_pagos_ids)


def check_invoice_amounts(migrated_pagos_ids: OldRefToNewId):
    # The app computes a Factura from the prices of its Albaranes, so a price lost in the migration changes its amount
    importes_by_factura_id = {
        factura.id: Decimal(f"{factura.importe:.2f}")
        for factura in fetch_facturas(migrated_pagos_ids)
        if factura.importe is not None
    }
    with get_read_cursor() as cursor:
        cursor.execute(
            'SELECT I.id, COALESCE(SUM(ROUND(COALESCE(DNL."unitPrice", SOL."partPrice", 0) * DNL.quantity, 2)), 0) '
            "FROM invoice I "
            'LEFT JOIN delivery_note DN ON DN."invoiceId" = I.id '
            'LEFT JOIN delivery_note_line DNL ON DNL."deliveryNoteId" = DN.id '
            'LEFT JOIN sell_order_line SOL ON SOL.id = DNL."sellOrderLineId" '
            "GROUP BY I.id ORDER BY I.id"
        )
        for invoice_id, amount in cursor.fetchall():
            importes = importes_by_factura_id.get(invoice_id)
            if importes is not None and abs(amount - importes) > Decimal("0.01"):
                logger.warning(f"Invoice {invoice_id} amounts to {amount} but Prisma invoiced {importes}")


def price_sell_order_lines_from_albaranes(
    postgres_cursor, albaran_prices_by_sell_order_line_id: defaultdict[int, set[float]]
):
    # Prisma kept the placeholder in the Pedido de venta and put the calculated price only in its Albaranes, so the
    # Pedido de venta takes it when all its Albaranes agree, for the quantity still pending
    postgres_cursor.execute('SELECT id FROM sell_order_line WHERE "partPrice" IS NULL')
    for (sell_order_line_id,) in postgres_cursor.fetchall():
        prices = albaran_prices_by_sell_order_line_id.get(sell_order_line_id, set())
        if len(prices) == 1:
            postgres_cursor.execute(
                'UPDATE sell_order_line SET "partPrice" = %s WHERE id = %s', (prices.pop(), sell_order_line_id)
            )


def reset_part_reference_clients(postgres_cursor):
    # Undo a previous assign_part_reference_clients run so the albaran step can be re-run
    postgres_cursor.execute(
        'UPDATE sell_order_line SOL SET "partReferenceId" = O.id FROM part_reference PR '
        'JOIN (SELECT "reference", MIN(id) AS id FROM part_reference GROUP BY "reference") O '
        'ON O."reference" = PR."reference" AND O.id < PR.id '
        'WHERE SOL."partReferenceId" = PR.id'
    )
    postgres_cursor.execute(
        'DELETE FROM part_reference PR USING part_reference O '
        'WHERE O."reference" = PR."reference" AND O.id < PR.id'
    )
    postgres_cursor.execute('UPDATE part_reference SET "clientId" = NULL')


def assign_part_reference_clients(postgres_cursor):
    postgres_cursor.execute(
        "CREATE TEMP TABLE part_reference_usage ON COMMIT DROP AS "
        'SELECT DISTINCT DNL."partReferenceId", DN."clientId" FROM delivery_note_line DNL '
        'JOIN delivery_note DN ON DN.id = DNL."deliveryNoteId" '
        'WHERE DNL."partReferenceId" IS NOT NULL '
        "UNION "
        'SELECT SOL."partReferenceId", SO."clientId" FROM sell_order_line SOL '
        'JOIN sell_order SO ON SO.id = SOL."sellOrderId" '
        'WHERE SO."clientId" IS NOT NULL'
    )
    postgres_cursor.execute(
        'UPDATE part_reference PR SET "clientId" = U."clientId" FROM ('
        'SELECT "partReferenceId", MIN("clientId") AS "clientId" FROM part_reference_usage GROUP BY "partReferenceId"'
        ') U WHERE PR.id = U."partReferenceId"'
    )
    postgres_cursor.execute(
        'INSERT INTO part_reference ("reference", "partId", "clientDescription", "clientId") '
        'SELECT PR."reference", PR."partId", PR."clientDescription", U."clientId" FROM part_reference_usage U '
        'JOIN part_reference PR ON PR.id = U."partReferenceId" WHERE U."clientId" <> PR."clientId"'
    )
    tqdm.write(f"Created {postgres_cursor.rowcount} part references for additional clients")
    postgres_cursor.execute(
        'UPDATE delivery_note_line DNL SET "partReferenceId" = C.id '
        "FROM delivery_note DN, part_reference PR, part_reference C "
        'WHERE DN.id = DNL."deliveryNoteId" AND PR.id = DNL."partReferenceId" '
        'AND C."reference" = PR."reference" AND C."clientId" = DN."clientId" AND C.id <> PR.id'
    )
    postgres_cursor.execute(
        'UPDATE sell_order_line SOL SET "partReferenceId" = C.id '
        "FROM sell_order SO, part_reference PR, part_reference C "
        'WHERE SO.id = SOL."sellOrderId" AND PR.id = SOL."partReferenceId" '
        'AND C."reference" = PR."reference" AND C."clientId" = SO."clientId" AND C.id <> PR.id'
    )


def firebird_migrate_pedventas(migrated_pagos_ids: OldRefToNewId, client_id_map: IdMap):
    ped_ventas = fetch_cab_pedventas(migrated_pagos_ids)
    lin_pedventas = fetch_lin_pedventas()
    tqdm.write(f"Found {len(ped_ventas)} ped_ventas")
    seen_spedidos: set[str] = set()

    with get_postgres_cursor() as postgres_cursor:
        clear_postgres_table(postgres_cursor, "sell_order")
        clear_postgres_table(postgres_cursor, "sell_order_line")
        postgres_cursor.connection.commit()
        for ped_venta in tqdm(ped_ventas, desc="Pedventas", dynamic_ncols=True):
            if ped_venta.cliente in IGNORED_CLIENT_IDS:
                continue
            spedido = ped_venta.spedido
            if spedido in seen_spedidos:
                spedido += f" / {ped_venta.fecha.strftime('%d/%m/%Y')}"
            seen_spedidos.add(spedido)
            postgres_cursor.execute(
                'INSERT INTO sell_order ("id", "receptionDate", "clientId", "clientReference", "paymentMethodId")'
                "VALUES (%s, %s, %s, %s, %s)",
                (
                    ped_venta.id,
                    ped_venta.fecha,
                    get_new_client_id(client_id_map, ped_venta.cliente),
                    spedido,
                    ped_venta.formapago,
                ),
            )
            sell_order_lines = lin_pedventas.get(ped_venta.id, [])
            for sell_order_line in sell_order_lines:
                # The app does not allow a quantity of 0, Prisma used these lines as notes
                if sell_order_line.cantidad == 0:
                    continue
                part_reference_id = get_part_reference_id_by_reference(
                    sell_order_line.articulo
                )
                postgres_cursor.execute(
                    'INSERT INTO sell_order_line ("quantity", "pendingQuantity", "partReferenceId", "description", "partPrice", "sellOrderId", "requestedDeliveryDate") '
                    "VALUES (%s, %s, %s, %s, %s, %s, %s)",
                    (
                        sell_order_line.cantidad,
                        # A return has a negative quantity, so what is left of it goes from its quantity up to 0
                        min(
                            max(sell_order_line.pendientes, min(sell_order_line.cantidad, 0)),
                            max(sell_order_line.cantidad, 0),
                        ),
                        part_reference_id,
                        sell_order_line.descripcion if part_reference_id is None else None,
                        sell_order_line.precio,
                        ped_venta.id,
                        sell_order_line.f_entrega,
                    ),
                )


def firebird_migrate_caracteristicas():
    caracteristicas = fetch_caracteristicas()
    tqdm.write(f"Found {len(caracteristicas)} caracteristicas")

    with get_postgres_cursor() as postgres_cursor:
        clear_postgres_table(postgres_cursor, "quality_check")
        clear_postgres_table(postgres_cursor, "part_feature")
        for caracteristica in tqdm(caracteristicas, desc="Caracteristicas", dynamic_ncols=True):
            if not (part_id := get_part_id_by_reference(caracteristica.articulo)):
                if is_unmigrated_articulo(caracteristica.articulo):
                    continue
                logger.warning(
                    f"Migrar Prisma caracteristicas: Part not found for reference {caracteristica.articulo}"
                )
                continue
            postgres_cursor.execute(
                'INSERT INTO part_feature ("feature", "partId") VALUES (%s, %s) ON CONFLICT DO NOTHING',
                (caracteristica.caracteristica, part_id),
            )


def firebird_migrate_clientes(migrated_pagos_ids: OldRefToNewId):
    all_clients = fetch_clientes(migrated_pagos_ids)
    used_client_ids = get_used_clientes_and_articulos()[0]
    used_client_ids = used_client_ids | {MERGED_CLIENTS[id] for id in used_client_ids if id in MERGED_CLIENTS}
    # Clientes with the same name are merged into one, so a used one keeps all of them
    used_names = {client.nombre for client in all_clients if client.id in used_client_ids}
    clients = [client for client in all_clients if client.nombre in used_names]
    tqdm.write(f"Found {len(all_clients)} clients, {len(clients)} with Pedidos de venta, Albaranes or Facturas")
    client_id_map: IdMap = {}
    with get_postgres_cursor() as postgres_cursor:
        for client in tqdm(clients, desc="Clients", dynamic_ncols=True):
            if client.id in IGNORED_CLIENT_IDS or client.id in MERGED_CLIENTS:
                continue
            try:
                if not (
                    new_client_id := assign_client_id(
                        client_id_map, client.id, client.nombre
                    )
                ):
                    continue
                if not client.cif:
                    continue
                postgres_cursor.execute(
                    'INSERT INTO client ("id", "name", "legalName", "address", "city", "province", "postalCode", "country", "phone", "taxId", '
                    '"defaultPaymentMethodId", "iban", "prismaAccountingAccountId") VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)',
                    (
                        new_client_id,
                        client.nombre,
                        client.nombrefiscal,
                        client.direccion,
                        client.localidad,
                        client.provincia,
                        client.codpostal,
                        client.pais,
                        client.telefono,
                        client.cif,
                        client.formapago,
                        client.iban,
                        client.ctaconta,
                    ),
                )
            except Exception as e:
                logger.error(f"Error inserting client {client.id}, {client.nombre}: {e}")
                raise e
    for old_client_id, merged_into_id in MERGED_CLIENTS.items():
        if merged_into_id in client_id_map:
            client_id_map[old_client_id] = client_id_map[merged_into_id]
    return client_id_map


def firebird_migrate_pagos() -> OldRefToNewId:
    pagos = fetch_pagos()
    tqdm.write(f"Found {len(pagos)} pagos")

    with get_postgres_cursor() as postgres_cursor:
        clear_postgres_table(postgres_cursor, "payment_method")
        migrated_pagos_ids: OldRefToNewId = {}
        for pago in tqdm(pagos, desc="Pagos", dynamic_ncols=True):
            if pago.id in MERGED_PAYMENT_METHODS:
                continue
            postgres_cursor.execute(
                'INSERT INTO payment_method ("name", "paymentDeadlineDays", "generatesReceipt") VALUES (%s, %s, %s) RETURNING id',
                (pago.nombre, pago.dias_vencimiento, pago.genera_recibo),
            )
            id_pago = fetch_id(postgres_cursor)
            migrated_pagos_ids[pago.id] = id_pago
        for old_pago_id, merged_into_id in MERGED_PAYMENT_METHODS.items():
            migrated_pagos_ids[old_pago_id] = migrated_pagos_ids[merged_into_id]
        return migrated_pagos_ids


def firebird_migrate_pvpespeciales(client_id_map: IdMap):
    pvpespeciales = fetch_pvpespeciales()
    tqdm.write(f"Found {len(pvpespeciales)} pvpespeciales")

    with get_postgres_cursor() as postgres_cursor:
        for row in tqdm(pvpespeciales, desc="Pvpespeciales", dynamic_ncols=True):
            # Ignored and unused Clientes are not migrated
            if row.cliente not in client_id_map:
                continue
            if not (part_id := get_part_id_by_reference(row.articulo)):
                if is_unmigrated_articulo(row.articulo):
                    continue
                logger.warning(
                    f"Migrar Prisma precios: Part ID not found for part price. Part: '{row.articulo}'"
                )
                continue
            if not (new_client_id := get_new_client_id(client_id_map, row.cliente)):
                continue
            postgres_cursor.execute(
                'INSERT INTO part_price ("price", "partId", "quantity", "clientId") VALUES (%s, %s, %s, %s)',
                (row.precio, part_id, row.lote, new_client_id),
            )


def firebird_migrate_facturas(client_id_map: IdMap, migrated_pagos_ids: OldRefToNewId):
    facturas = fetch_facturas(migrated_pagos_ids)
    tqdm.write(f"Found {len(facturas)} facturas")

    with get_postgres_cursor() as postgres_cursor:
        clear_postgres_table(postgres_cursor, "invoice")
        for factura in tqdm(facturas, desc="Facturas", dynamic_ncols=True):
            if factura.cliente in IGNORED_CLIENT_IDS:
                continue
            postgres_cursor.execute(
                'INSERT INTO invoice ("id", "createdAt", "dueDate", "accounted", "paymentMethodId", "clientId", "sent") '
                "VALUES (%s, %s, COALESCE(%s, %s + make_interval(days => COALESCE("
                '(SELECT "paymentDeadlineDays" FROM payment_method WHERE id = %s), 0))), %s, %s, %s, TRUE)',
                (
                    factura.id,
                    factura.fecha,
                    factura.vencimiento,
                    factura.fecha,
                    factura.formapago,
                    factura.contabilizado,
                    factura.formapago,
                    get_new_client_id(client_id_map, factura.cliente),
                ),
            )
