import { useLiveQuery, and, gte, inArray, isNull, lte, not, or, eq, materialize, sum } from "@tanstack/react-db";

import blueprintCollection from "@/collections/blueprint";
import clientCollection from "@/collections/client";
import machineCollection from "@/collections/machine";
import machineProductionOrderQueueCollection from "@/collections/machine-production-order-queue";
import partCollection from "@/collections/part";
import partProductionCollection from "@/collections/part-production";
import partReferenceCollection from "@/collections/part-reference";
import productionOrderCollection from "@/collections/production-order";
import sellOrderCollection from "@/collections/sell-order";
import sellOrderLineCollection from "@/collections/sell-order-line";
import shapeCollection from "@/collections/shape";
import { includesIgnoringAccents } from "@/lib/utils";
import type { TSort } from "@/schemas";
import type { TMachineFilters } from "@/schemas/machine";
import { getFilterValue } from "@/schemas/utils";
import type { TBaseQueryProps } from "@/types";

const DEFAULT_SORTING: Array<TSort> = [
  { id: "maxDiameter", desc: false },
  { id: "id", desc: false },
];

export function useQueryMachines({ filters, sorts }: TBaseQueryProps<TMachineFilters> = {}) {
  return useLiveQuery({
    queryKey: ["machines", filters, sorts],
    query: (q) => {
      let query = q.from({ machine: machineCollection });
      const name = getFilterValue(filters, "name");
      if (name != null) {
        query = query.fn.where(({ machine }) => includesIgnoringAccents(machine.name, name));
      }
      if (getFilterValue(filters, "activeProductionOrderIds") != null) {
        query = query.where(({ machine }) =>
          inArray(machine.activeProductionOrderId, getFilterValue(filters, "activeProductionOrderIds") ?? []),
        );
      }
      if (getFilterValue(filters, "excludeItemIds") != null) {
        query = query.where(({ machine }) => not(inArray(machine.id, getFilterValue(filters, "excludeItemIds") ?? [])));
      }
      const compatiblePartWidth = getFilterValue(filters, "compatiblePartWidth");
      if (compatiblePartWidth != null) {
        query = query.where(({ machine }) =>
          and(
            or(isNull(machine.minDiameter), lte(machine.minDiameter, compatiblePartWidth)),
            or(isNull(machine.maxDiameter), gte(machine.maxDiameter, compatiblePartWidth)),
          ),
        );
      }
      if (getFilterValue(filters, "deletedAt") !== true) {
        query = query.where(({ machine }) => isNull(machine.deletedAt));
      }

      for (const sort of sorts ?? DEFAULT_SORTING) {
        query = query.orderBy(({ machine }) => machine[sort.id as keyof typeof machine], {
          direction: sort.desc ? "desc" : "asc",
          nulls: "last",
        });
      }

      return query
        .select(({ machine }) => ({
          ...machine,
        }))
        .distinct();
    },
  });
}

export function useQueryMachineById(id?: number) {
  return useLiveQuery({
    query: (q) =>
      id === undefined
        ? undefined
        : q
            .from({ machine: machineCollection })
            .where(({ machine }) => eq(machine.id, id))
            .findOne(),
  });
}

export function useQueryMachineProductionOrderQueue({ machineId }: { machineId?: number }) {
  return useLiveQuery({
    query: (q) =>
      q
        .from({ machineProductionOrderQueue: machineProductionOrderQueueCollection })
        .where(({ machineProductionOrderQueue }) => eq(machineProductionOrderQueue.machineId, machineId))
        .innerJoin({ productionOrder: productionOrderCollection }, ({ productionOrder, machineProductionOrderQueue }) =>
          eq(machineProductionOrderQueue.productionOrderId, productionOrder.id),
        )
        .select(({ productionOrder }) => ({
          ...productionOrder,
          sellOrderLine: materialize(
            q
              .from({ sellOrderLine: sellOrderLineCollection })
              .where(({ sellOrderLine }) => eq(sellOrderLine.id, productionOrder.sellOrderLineId))
              .select(({ sellOrderLine }) => ({
                ...sellOrderLine,
                partReference: materialize(
                  q
                    .from({ partReference: partReferenceCollection })
                    .where(({ partReference }) => eq(partReference.id, sellOrderLine.partReferenceId))
                    .findOne(),
                ),
                sellOrder: materialize(
                  q
                    .from({ sellOrder: sellOrderCollection })
                    .where(({ sellOrder }) => eq(sellOrder.id, sellOrderLine.sellOrderId))
                    .select(({ sellOrder }) => ({
                      ...sellOrder,
                      client: materialize(
                        q
                          .from({ client: clientCollection })
                          .where(({ client }) => eq(client.id, sellOrder.clientId))
                          .findOne(),
                      ),
                    }))
                    .findOne(),
                ),
              }))
              .findOne(),
          ),
          producedQuantity: materialize(
            q
              .from({ partProduction: partProductionCollection })
              .where(({ partProduction }) => eq(partProduction.productionOrderId, productionOrder.id))
              .select(({ partProduction }) => ({ producedQuantity: sum(partProduction.quantity) }))
              .findOne(),
          ),
          part: materialize(
            q
              .from({ part: partCollection })
              .where(({ part }) => eq(part.id, productionOrder.partId))
              .select(({ part }) => ({
                ...part,
                shape: materialize(
                  q
                    .from({ shape: shapeCollection })
                    .where(({ shape }) => eq(part.shapeId, shape.id))
                    .findOne(),
                ),
                blueprints: materialize(
                  q.from({ blueprint: blueprintCollection }).where(({ blueprint }) => eq(blueprint.partId, part.id)),
                ),
              }))
              .findOne(),
          ),
        }))
        .orderBy(({ machineProductionOrderQueue }) => machineProductionOrderQueue.timestamp, "desc"),
  });
}
export type TMachineProductionOrderQueueItem = NonNullable<
  ReturnType<typeof useQueryMachineProductionOrderQueue>["data"]
>[number];
