from datetime import datetime

from tqdm import tqdm

from migration_scripts import OldRefToNewId
from migration_scripts.firebird_fetch import is_unmigrated_articulo, resolve_articulo_reference
from migration_scripts.logger import logger
from migration_scripts.postgres_utils import (
    get_sell_order_line_id_by_client_reference,
    get_part_id_by_reference,
)
from migration_scripts.raio_fetch import (
    get_raio_coatings,
    get_raio_caracteristicas,
    get_raio_production_orders,
    get_raio_active_production_orders,
    get_raio_materials,
)
from migration_scripts.connections import fetch_id, get_postgres_cursor
from migration_scripts.secrets import FALLBACK_MACHINE, MACHINES
from migration_scripts.secrets import RAW_MATERIAL_DENSITY_AND_PRICE, RENAMED_RAW_MATERIALS
from migration_scripts.utils import clear_postgres_table


def raio_migrate_coatings() -> OldRefToNewId:
    raio_coatings = get_raio_coatings()
    coatings: OldRefToNewId = {}
    with get_postgres_cursor() as postgres_cursor:
        clear_postgres_table(postgres_cursor, "coating")
        for coating in tqdm(raio_coatings, desc="Coatings", dynamic_ncols=True):
            postgres_cursor.execute(
                'INSERT INTO coating ("name") VALUES (%s) RETURNING id',
                (coating.coating,),
            )
            coatings[coating.coating] = fetch_id(postgres_cursor)
    return coatings


def raio_migrate_caracteristicas():
    raio_caracteristicas = get_raio_caracteristicas()
    tqdm.write(f"Migrando {len(raio_caracteristicas)} caracteristicas del RAIO")
    with get_postgres_cursor() as cursor:
        # Both sources describe the same features with different spellings, so RAIO replaces Prisma instead of duplicating
        part_ids = list({raio_caracteristica.part_id for raio_caracteristica in raio_caracteristicas})
        cursor.execute(
            'DELETE FROM quality_check WHERE "partFeatureId" IN (SELECT id FROM part_feature WHERE "partId" = ANY(%s))',
            (part_ids,),
        )
        cursor.execute('DELETE FROM part_feature WHERE "partId" = ANY(%s)', (part_ids,))
        for raio_caracteristica in tqdm(raio_caracteristicas, desc="RAIO caracteristicas", dynamic_ncols=True):
            cursor.execute(
                'INSERT INTO part_feature ("feature", "partId") VALUES (%s, %s)',
                (raio_caracteristica.char, raio_caracteristica.part_id),
            )


def raio_migrate_machines_production_orders() -> tuple[OldRefToNewId, OldRefToNewId]:
    raio_production_orders = get_raio_production_orders()

    tqdm.write(f"Migrando {len(MACHINES)} maquinas del RAIO")
    tqdm.write(f"Migrando {len(raio_production_orders)} órdenes de producción del RAIO")

    production_orders: OldRefToNewId = {}
    machines: OldRefToNewId = {}
    now = datetime.now()

    with get_postgres_cursor() as postgres_cursor:
        clear_postgres_table(postgres_cursor, "machine")
        clear_postgres_table(postgres_cursor, "treatment_reception")
        clear_postgres_table(postgres_cursor, "treatment_shipment")
        clear_postgres_table(postgres_cursor, "production_order")
        clear_postgres_table(postgres_cursor, "part_production")
        for machine in tqdm(MACHINES, desc="Machines", dynamic_ncols=True):
            postgres_cursor.execute(
                'INSERT INTO machine ("name", "minDiameter", "maxDiameter") VALUES (%s, %s, %s) RETURNING id',
                (machine.name, machine.min_diameter, machine.max_diameter),
            )
            machines[machine.name] = fetch_id(postgres_cursor)
        postgres_cursor.execute('SELECT id FROM part WHERE "coatingId" IS NOT NULL')
        coated_part_ids = {row[0] for row in postgres_cursor.fetchall()}
        for production_order in tqdm(raio_production_orders, desc="Production orders", dynamic_ncols=True):
            if not (part_id := get_part_id_by_reference(resolve_articulo_reference(production_order.reference))):
                if not is_unmigrated_articulo(production_order.reference):
                    logger.warning(
                        f"Migrar RAIO production orders: Part reference not found: {production_order.reference}"
                    )
                continue
            sell_order_line_id = (
                get_sell_order_line_id_by_client_reference(
                    production_order.spod, production_order.reference
                )
                if production_order.spod
                else None
            )
            if not sell_order_line_id:
                logger.warning(
                    f"Migrar RAIO production orders: Sell order line not found for sell order "
                    f'client reference "{production_order.spod}", reference "{production_order.reference}"'
                )
            postgres_cursor.execute(
                'INSERT INTO production_order ("quantity", "notes", "sellOrderLineId", "partId", "createdAt", "urgent") VALUES (%s, %s, %s, %s, %s, %s) RETURNING id',
                (
                    # RAIO closes orders manually, sometimes short of quantity (e.g. covered by stock), and status here is derived from produced quantity
                    min(production_order.counter, production_order.quantity)
                    if production_order.bool_done and production_order.counter
                    else production_order.quantity,
                    production_order.observations,
                    sell_order_line_id,
                    part_id,
                    production_order.date_order,
                    production_order.importance == 1,
                ),
            )
            production_order_id = fetch_id(postgres_cursor)
            production_orders[str(production_order.id)] = production_order_id

            machine = production_order.machine or production_order.assigned
            assigned_machine_id = machines.get(machine) if machine else None

            if assigned_machine_id and production_order.bool_done == 0:
                postgres_cursor.execute(
                    'INSERT INTO machine_production_order_queue ("machineId", "productionOrderId", "timestamp") VALUES (%s, %s, %s)',
                    (
                        assigned_machine_id,
                        production_order_id,
                        production_order.date_order,
                    ),
                )
            # RAIO completed orders without a counter would stay pending here, assume the full quantity was produced
            produced_quantity = production_order.counter or (
                production_order.quantity if production_order.bool_done else None
            )
            if produced_quantity:
                termination_date = (
                    production_order.date_finish
                    if production_order.date_finish
                    else production_order.date_deliver
                )
                postgres_cursor.execute(
                    'INSERT INTO part_production ("machineId", "productionOrderId", "quantity", "date") VALUES (%s, %s, %s, %s)',
                    (
                        assigned_machine_id or machines[FALLBACK_MACHINE],
                        production_order_id,
                        produced_quantity,
                        termination_date,
                    ),
                )
                # RAIO coating_status 1 means sent to treatment; 0 is also left on many orders long received back, so it is not trusted
                if production_order.coating_status == 1 or (production_order.bool_done and part_id in coated_part_ids):
                    # RAIO does not store when parts went to treatment, the ones still there are sent as one batch today
                    sent_at = now if production_order.coating_status == 1 else termination_date or now
                    postgres_cursor.execute(
                        'INSERT INTO treatment_shipment ("partId", "productionOrderId", "quantity", "sentAt") VALUES (%s, %s, %s, %s) RETURNING id',
                        (part_id, production_order_id, produced_quantity, sent_at),
                    )
                    treatment_shipment_id = fetch_id(postgres_cursor)
                    if production_order.coating_status != 1:
                        postgres_cursor.execute(
                            'INSERT INTO treatment_reception ("treatmentShipmentId", "quantity", "receivedAt") VALUES (%s, %s, %s)',
                            (treatment_shipment_id, produced_quantity, sent_at),
                        )
    return machines, production_orders


def raio_migrate_active_production_orders(
    migrated_machines: OldRefToNewId, migrated_production_orders: OldRefToNewId
):
    assigned_orders = get_raio_active_production_orders()
    with get_postgres_cursor() as cursor:
        for active_order in tqdm(assigned_orders, desc="Active production orders", dynamic_ncols=True):
            new_order_id = migrated_production_orders.get(str(active_order.id))
            machine_id = (
                migrated_machines.get(active_order.machine)
                if active_order.machine
                else None
            )
            if not new_order_id or not machine_id:
                logger.error(
                    f"Error migrating active production order: {new_order_id=} {machine_id=} {active_order=} "
                )
                continue
            cursor.execute(
                'UPDATE machine SET "activeProductionOrderId" = %s WHERE id = %s',
                (new_order_id, machine_id),
            )


def raio_migrate_raw_materials() -> OldRefToNewId:
    raio_materials = get_raio_materials()
    materials: OldRefToNewId = {}
    ids_by_name: dict[str, int] = {}
    with get_postgres_cursor() as postgres_cursor:
        clear_postgres_table(postgres_cursor, "raw_material")
        for material in tqdm(raio_materials, desc="Raw materials", dynamic_ncols=True):
            name = RENAMED_RAW_MATERIALS.get(material.quality, material.quality)
            if name not in ids_by_name:
                density, price = RAW_MATERIAL_DENSITY_AND_PRICE.get(name, (None, None))
                postgres_cursor.execute(
                    'INSERT INTO raw_material ("name", "density", "price") VALUES (%s, %s, %s) RETURNING id',
                    (name, density, price),
                )
                ids_by_name[name] = fetch_id(postgres_cursor)
            materials[material.quality] = ids_by_name[name]
    return materials
