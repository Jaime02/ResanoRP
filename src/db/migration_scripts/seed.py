from . import OldRefToNewId
from .connections import fetch_id, get_postgres_cursor
from .models import Material
from .secrets import CONFIGURATION, DELIVERY_METHODS, MATERIAL_WIDTHS, RENAMED_RAW_MATERIALS, SHAPES


def seed_configuration():
    columns = ", ".join(f'"{column}"' for column in CONFIGURATION)
    placeholders = ", ".join(["%s"] * len(CONFIGURATION))
    with get_postgres_cursor() as cursor:
        cursor.execute(
            f"INSERT INTO configuration ({columns}) VALUES ({placeholders})",
            tuple(CONFIGURATION.values()),
        )


def seed_shapes():
    with get_postgres_cursor() as cursor:
        for shape in SHAPES:
            cursor.execute('INSERT INTO shape ("name") VALUES (%s)', (shape.name,))


def seed_delivery_methods():
    with get_postgres_cursor() as cursor:
        for delivery_method in DELIVERY_METHODS:
            cursor.execute(
                'INSERT INTO delivery_method ("name") VALUES (%s)',
                (delivery_method.name,),
            )


def seed_materials(migrated_raw_materials: OldRefToNewId) -> list[Material]:
    materials: list[Material] = []
    with get_postgres_cursor() as cursor:
        raw_material_ids_by_name = {
            RENAMED_RAW_MATERIALS.get(quality, quality): raw_material_id
            for quality, raw_material_id in migrated_raw_materials.items()
        }
        for name, raw_material_id in raw_material_ids_by_name.items():
            for width in MATERIAL_WIDTHS.get(name, []):
                cursor.execute(
                    'INSERT INTO material ("width", "shapeId", "rawMaterialId") VALUES (%s, %s, %s) RETURNING id',
                    (width, 1, raw_material_id),
                )
                material = Material(
                    id=fetch_id(cursor),
                    width=width,
                    shapeId=1,
                    rawMaterialId=raw_material_id,
                )
                materials.append(material)
    return materials
