from __future__ import annotations

from tqdm import tqdm

from utils.load_raio_sql import load_raio_sql
from migration_scripts.connections import setup
from migration_scripts.logger import clear_log
from migration_scripts.firebird_migrate import (
    firebird_migrate_pagos,
    firebird_migrate_clientes,
    firebird_migrate_articulos,
    firebird_migrate_tarifas,
    firebird_migrate_pedventas,
    firebird_migrate_albaran,
    firebird_migrate_caracteristicas,
    firebird_migrate_facturas,
    firebird_migrate_pvpespeciales,
)
from migration_scripts.raio_migrate import (
    raio_migrate_coatings,
    raio_migrate_caracteristicas,
    raio_migrate_active_production_orders,
    raio_migrate_raw_materials,
    raio_migrate_machines_production_orders,
)
from migration_scripts.ofertas_migrate import migrate_ofertas
from migration_scripts.seed import seed_configuration, seed_shapes, seed_delivery_methods, seed_materials


def main():
    if input("Load RAIO SQL dump? (y/n): ").strip().lower() in ["yes", "y"]:
        load_raio_sql()

    clear_log()
    setup()

    seed_configuration()
    seed_shapes()
    seed_delivery_methods()

    raw_materials = raio_migrate_raw_materials()
    materials = seed_materials(raw_materials)
    pagos_ids = firebird_migrate_pagos()
    coatings = raio_migrate_coatings()
    client_id_map = firebird_migrate_clientes(pagos_ids)

    firebird_migrate_articulos(coatings, raw_materials, materials)
    firebird_migrate_tarifas()
    firebird_migrate_pedventas(pagos_ids, client_id_map)
    firebird_migrate_facturas(client_id_map, pagos_ids)
    firebird_migrate_albaran(pagos_ids, client_id_map)
    firebird_migrate_caracteristicas()
    raio_migrate_caracteristicas()
    firebird_migrate_pvpespeciales(client_id_map)
    migrate_ofertas()

    machines, production_orders = raio_migrate_machines_production_orders()
    raio_migrate_active_production_orders(machines, production_orders)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        tqdm.write("\n⛔ Interrupted.")
