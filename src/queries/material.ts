import type { InitialQueryBuilder } from "@tanstack/react-db";
import { eq, useLiveQuery, materialize, isNull } from "@tanstack/react-db";

import materialCollection from "@/collections/material";
import rawMaterialCollection from "@/collections/raw-material";
import shapeCollection from "@/collections/shape";
import type { TSort } from "@/schemas";
import type { TMaterialFilters } from "@/schemas/material";
import { getFilterValue } from "@/schemas/utils";
import type { TBaseQueryProps } from "@/types";

const DEFAULT_SORTING: Array<TSort> = [{ id: "id", desc: false }];

function materialSelectProjection({
  query,
  filters,
  sorts,
}: { query: InitialQueryBuilder } & TBaseQueryProps<TMaterialFilters>) {
  let q = query.from({ material: materialCollection });

  if (getFilterValue(filters, "rawMaterialId") != null) {
    q = q.where(({ material }) => eq(material.rawMaterialId, getFilterValue(filters, "rawMaterialId")));
  }
  if (getFilterValue(filters, "shapeId") != null) {
    q = q.where(({ material }) => eq(material.shapeId, getFilterValue(filters, "shapeId")));
  }
  const width = getFilterValue(filters, "width");
  if (width != null) {
    // The numeric width is synced as text keeping the scale it was inserted with, so 12 may be "12" or "12.0"
    q = q.fn.where(({ material }) => Number(material.width) === Number(width));
  }
  if (getFilterValue(filters, "deletedAt") !== true) {
    q = q.where(({ material }) => isNull(material.deletedAt));
  }

  for (const sort of sorts ?? DEFAULT_SORTING) {
    q = q.orderBy(({ material }) => material[sort.id as keyof typeof material], sort.desc ? "desc" : "asc");
  }

  return q.select(({ material }) => ({
    ...material,
    rawMaterial: materialize(
      query
        .from({ rawMaterial: rawMaterialCollection })
        .where(({ rawMaterial }) => eq(rawMaterial.id, material.rawMaterialId))
        .findOne(),
    ),
    shape: materialize(
      query
        .from({ shape: shapeCollection })
        .where(({ shape }) => eq(shape.id, material.shapeId))
        .findOne(),
    ),
  }));
}

export function useQueryMaterials({ filters, sorts }: TBaseQueryProps<TMaterialFilters>) {
  return useLiveQuery({
    queryKey: ["materialTable", filters, sorts],
    query: (query) => materialSelectProjection({ query, filters, sorts }),
  });
}

export type TQueryMaterial = ReturnType<typeof useQueryMaterials>["data"][number];
