import { and, eq, or, materialize, useLiveQuery, isNull, isUndefined, gte, multiply } from "@tanstack/react-db";

import materialCollection from "@/collections/material";
import partMaterialCollection from "@/collections/part-material";
import rawMaterialCollection from "@/collections/raw-material";
import shapeCollection from "@/collections/shape";

export function useQueryCompatiblePartMaterials({
  partId,
  shapeId,
  width,
  selectedRawMaterialId,
  skip = false,
}: {
  partId?: number;
  shapeId?: number | null;
  width?: string | null;
  selectedRawMaterialId?: number;
  skip?: boolean;
}) {
  return useLiveQuery((q) => {
    if (shapeId === undefined || partId === undefined || width === undefined || skip) return undefined;
    const partMaterialsForPart = q
      .from({ partMaterial: partMaterialCollection })
      .where(({ partMaterial }) => eq(partMaterial.partId, partId));
    return q
      .from({ material: materialCollection })
      .leftJoin({ partMaterial: partMaterialsForPart }, ({ material, partMaterial }) =>
        eq(partMaterial.materialId, material.id),
      )
      .innerJoin({ compatibleRawMaterial: rawMaterialCollection }, ({ material, compatibleRawMaterial }) =>
        eq(compatibleRawMaterial.id, material.rawMaterialId),
      )
      .where(({ partMaterial }) => isUndefined(partMaterial.materialId))
      .where(({ material, compatibleRawMaterial }) =>
        and(
          eq(material.shapeId, shapeId),
          gte(multiply(material.width, 1), width === null ? null : Number(width)),
          isNull(material.deletedAt),
          isNull(compatibleRawMaterial.deletedAt),
        ),
      )
      .where(({ material }) =>
        or(eq(material.rawMaterialId, selectedRawMaterialId), isUndefined(selectedRawMaterialId)),
      )
      .select(({ material }) => ({
        ...material,
        rawMaterial: materialize(
          q
            .from({ rawMaterial: rawMaterialCollection })
            .where(({ rawMaterial }) => eq(rawMaterial.id, material.rawMaterialId))
            .findOne(),
        ),
        shape: materialize(
          q
            .from({ shape: shapeCollection })
            .where(({ shape }) => eq(shape.id, material.shapeId))
            .findOne(),
        ),
      }))
      .orderBy(({ material }) => multiply(material.width, 1), "asc")
      .orderBy(({ material }) => material.id, "asc");
  });
}

export type TCompatiblePartMaterial = NonNullable<ReturnType<typeof useQueryCompatiblePartMaterials>["data"]>[number];
