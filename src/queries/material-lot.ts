import { count, eq, inArray, materialize, sum, useLiveQuery } from "@tanstack/react-db";
import type { InitialQueryBuilder, Ref } from "@tanstack/react-db";
import { useMemo } from "react";

import materialCollection from "@/collections/material";
import materialLotCollection from "@/collections/material-lot";
import materialLotMovementCollection from "@/collections/material-lot-movement";
import rawMaterialCollection from "@/collections/raw-material";
import shapeCollection from "@/collections/shape";
import { formatMaterial } from "@/lib/formatters";
import type { BaseMaterialLot } from "@/types/material-lot";

function materialLotFields(q: InitialQueryBuilder, materialLot: Ref<BaseMaterialLot>) {
  return {
    material: materialize(
      q
        .from({ material: materialCollection })
        .where(({ material }) => eq(material.id, materialLot.materialId))
        .select(({ material }) => ({
          width: material.width,
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
        .findOne(),
    ),
    moved: materialize(
      q
        .from({ movement: materialLotMovementCollection })
        .where(({ movement }) => eq(movement.materialLotId, materialLot.id))
        .select(({ movement }) => ({ count: count(movement.id), quantity: sum(movement.quantity) }))
        .findOne(),
    ),
  };
}

function withRemaining<
  TMaterialLot extends {
    receivedQuantity: number;
    moved?: { quantity: number } | null;
    material?: { width: string; rawMaterial?: { name: string } | null } | null;
  },
>(materialLot: TMaterialLot) {
  return {
    ...materialLot,
    materialName:
      materialLot.material != null
        ? formatMaterial({ rawMaterialName: materialLot.material.rawMaterial?.name, width: materialLot.material.width })
        : "",
    remaining: materialLot.receivedQuantity + (materialLot.moved?.quantity ?? 0),
  };
}

export function useQueryMaterialLots({ materialIds }: { materialIds?: Array<number> }) {
  const { data, ...rest } = useLiveQuery({
    queryKey: ["materialLots", materialIds],
    query: (q) => {
      let query = q.from({ materialLot: materialLotCollection });
      if (materialIds !== undefined) {
        query = query.where(({ materialLot }) => inArray(materialLot.materialId, materialIds));
      }
      return query
        .orderBy(({ materialLot }) => materialLot.receivedAt, "desc")
        .orderBy(({ materialLot }) => materialLot.id, "desc")
        .select(({ materialLot }) => ({ ...materialLot, ...materialLotFields(q, materialLot) }));
    },
  });
  const materialLots = useMemo(() => data.map(withRemaining), [data]);
  return { ...rest, data: materialLots };
}
export type TQueryMaterialLot = ReturnType<typeof useQueryMaterialLots>["data"][number];

export function useQueryMaterialLotMovements({
  materialLotId,
  productionOrderId,
}: {
  materialLotId?: number;
  productionOrderId?: number;
}) {
  const { data, ...rest } = useLiveQuery({
    queryKey: ["materialLotMovements", materialLotId, productionOrderId],
    query: (q) => {
      if (materialLotId === undefined && productionOrderId === undefined) return undefined;
      return q
        .from({ movement: materialLotMovementCollection })
        .where(({ movement }) =>
          materialLotId !== undefined
            ? eq(movement.materialLotId, materialLotId)
            : eq(movement.productionOrderId, productionOrderId),
        )
        .orderBy(({ movement }) => movement.date, "desc")
        .orderBy(({ movement }) => movement.id, "desc")
        .select(({ movement }) => ({
          ...movement,
          materialLot: materialize(
            q
              .from({ materialLot: materialLotCollection })
              .where(({ materialLot }) => eq(materialLot.id, movement.materialLotId))
              .select(({ materialLot }) => ({ ...materialLot, ...materialLotFields(q, materialLot) }))
              .findOne(),
          ),
        }));
    },
  });
  const movements = useMemo(
    () =>
      (data ?? []).map((movement) => ({
        ...movement,
        materialLot: movement.materialLot != null ? withRemaining(movement.materialLot) : undefined,
      })),
    [data],
  );
  return { ...rest, data: movements };
}
export type TQueryMaterialLotMovement = ReturnType<typeof useQueryMaterialLotMovements>["data"][number];
