import type { InitialQueryBuilder } from "@tanstack/react-db";
import { count, eq, gte, lte, materialize, useLiveQuery } from "@tanstack/react-db";

import blueprintCollection from "@/collections/blueprint";
import clientCollection from "@/collections/client";
import machineCollection from "@/collections/machine";
import partCollection from "@/collections/part";
import partProductionCollection from "@/collections/part-production";
import partReferenceCollection from "@/collections/part-reference";
import productionOrderCollection from "@/collections/production-order";
import sellOrderCollection from "@/collections/sell-order";
import sellOrderLineCollection from "@/collections/sell-order-line";
import { endOfAppDay, startOfAppDay } from "@/lib/dates";
import type { TSort } from "@/schemas";
import type { TPartProductionFilters } from "@/schemas/part-production";
import { getFilterValue } from "@/schemas/utils";
import { DEFAULT_PAGINATION, type TBaseQueryProps } from "@/types";

const DEFAULT_SORTING: Array<TSort> = [{ id: "date", desc: true }];

function buildFilteredPartProductions(query: InitialQueryBuilder, filters?: TPartProductionFilters) {
  let q = query.from({ partProduction: partProductionCollection });

  const partId = getFilterValue(filters, "partId");
  if (partId != null) {
    q = q
      .innerJoin({ productionOrder: productionOrderCollection }, ({ partProduction, productionOrder }) =>
        eq(partProduction.productionOrderId, productionOrder.id),
      )
      .where(({ productionOrder }) => eq(productionOrder.partId, partId));
  }
  if (getFilterValue(filters, "machineId") != null) {
    q = q.where(({ partProduction }) => eq(partProduction.machineId, getFilterValue(filters, "machineId")));
  }
  const dateFilter = getFilterValue(filters, "date");
  if (dateFilter?.startDate != null) {
    const startDate = startOfAppDay(dateFilter.startDate);
    q = q.where(({ partProduction }) => gte(partProduction.date, startDate));
  }
  if (dateFilter?.endDate != null) {
    const endDate = endOfAppDay(dateFilter.endDate);
    q = q.where(({ partProduction }) => lte(partProduction.date, endDate));
  }
  return q;
}

function partProductionSelectProjection({
  query,
  filters,
  pagination = DEFAULT_PAGINATION,
  sorts,
}: {
  query: InitialQueryBuilder;
} & TBaseQueryProps<TPartProductionFilters>) {
  let q = buildFilteredPartProductions(query, filters);

  for (const sort of sorts ?? DEFAULT_SORTING) {
    q = q.orderBy(
      ({ partProduction }) => partProduction[sort.id as keyof typeof partProduction],
      sort.desc ? "desc" : "asc",
    );
  }

  if (pagination !== null) {
    q = q.limit(pagination.pageSize ?? 10).offset((pagination.pageIndex ?? 0) * (pagination.pageSize ?? 10));
  }

  return q.select(({ partProduction }) => ({
    ...partProduction,
    machine: materialize(
      query
        .from({ machine: machineCollection })
        .where(({ machine }) => eq(machine.id, partProduction.machineId))
        .findOne(),
    ),
    productionOrder: materialize(
      query
        .from({ partProductionProductionOrder: productionOrderCollection })
        .where(({ partProductionProductionOrder }) =>
          eq(partProductionProductionOrder.id, partProduction.productionOrderId),
        )
        .select(({ partProductionProductionOrder }) => ({
          ...partProductionProductionOrder,
          part: materialize(
            query
              .from({ part: partCollection })
              .where(({ part }) => eq(part.id, partProductionProductionOrder.partId))
              .select(({ part }) => ({
                ...part,
                blueprints: materialize(
                  query
                    .from({ blueprint: blueprintCollection })
                    .where(({ blueprint }) => eq(blueprint.partId, part.id)),
                ),
                references: materialize(
                  query
                    .from({ partReference: partReferenceCollection })
                    .where(({ partReference }) => eq(partReference.partId, part.id))
                    .select(({ partReference }) => ({
                      ...partReference,
                      client: materialize(
                        query
                          .from({ client: clientCollection })
                          .where(({ client }) => eq(client.id, partReference.clientId))
                          .findOne(),
                      ),
                    })),
                ),
              }))
              .findOne(),
          ),
          sellOrderLine: materialize(
            query
              .from({ sellOrderLine: sellOrderLineCollection })
              .where(({ sellOrderLine }) => eq(sellOrderLine.id, partProductionProductionOrder.sellOrderLineId))
              .select(({ sellOrderLine }) => ({
                ...sellOrderLine,
                partReference: materialize(
                  query
                    .from({ partReference: partReferenceCollection })
                    .where(({ partReference }) => eq(partReference.id, sellOrderLine.partReferenceId))
                    .findOne(),
                ),
                sellOrder: materialize(
                  query
                    .from({ sellOrder: sellOrderCollection })
                    .where(({ sellOrder }) => eq(sellOrder.id, sellOrderLine.sellOrderId))
                    .select(({ sellOrder }) => ({
                      ...sellOrder,
                      client: materialize(
                        query
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
        }))
        .findOne(),
    ),
  }));
}

export function useQueryPartProductionHistory({
  skip = false,
  filters,
  pagination,
  sorts,
}: {
  skip?: boolean;
} & TBaseQueryProps<TPartProductionFilters> = {}) {
  const { data: countData, isReady: isCountReady } = useLiveQuery((q) => {
    if (skip) return undefined;
    return buildFilteredPartProductions(q, filters).select(({ partProduction }) => ({
      count: count(partProduction.id),
    }));
  });

  const result = useLiveQuery((query) => {
    if (skip) return undefined;
    return partProductionSelectProjection({ query, filters, pagination, sorts });
  });

  return { ...result, rowCount: isCountReady ? (countData?.at(0)?.count ?? 0) : null };
}

export type TPartProductionHistory = NonNullable<ReturnType<typeof useQueryPartProductionHistory>["data"]>[number];
