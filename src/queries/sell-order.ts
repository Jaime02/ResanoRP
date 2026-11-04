import type { InitialQueryBuilder } from "@tanstack/react-db";
import {
  and,
  count,
  eq,
  gt,
  groupKeys,
  gte,
  isNull,
  isUndefined,
  lt,
  lte,
  materialize,
  not,
  or,
  useLiveQuery,
} from "@tanstack/react-db";

import blueprintCollection from "@/collections/blueprint";
import clientCollection from "@/collections/client";
import partCollection from "@/collections/part";
import partReferenceCollection from "@/collections/part-reference";
import paymentMethodCollection from "@/collections/payment-method";
import sellOrderCollection from "@/collections/sell-order";
import sellOrderLineCollection from "@/collections/sell-order-line";
import { endOfAppDay, startOfAppDay } from "@/lib/dates";
import { includesIgnoringAccents } from "@/lib/utils";
import type { TSort } from "@/schemas";
import { SellOrderStatus } from "@/schemas/sell-order";
import type { TSellOrderFilters } from "@/schemas/sell-order";
import { getFilterValue } from "@/schemas/utils";
import { DEFAULT_PAGINATION, type TBaseQueryProps } from "@/types";

const DEFAULT_SORTING: Array<TSort> = [{ id: "id", desc: false }];

function buildFilteredSellOrders(q: InitialQueryBuilder, filters?: TSellOrderFilters) {
  const pendingLineCounts = q
    .from({ pendingLine: sellOrderLineCollection })
    .where(({ pendingLine }) => and(isNull(pendingLine.deletedAt), not(eq(pendingLine.pendingQuantity, 0))))
    .groupBy(({ pendingLine }) => pendingLine.sellOrderId)
    .select(({ pendingLine }) => ({ sellOrderId: pendingLine.sellOrderId, pendingLineCount: count(pendingLine.id) }));

  // Named apart from the `client` include of the projection below, since an alias shared with an include leaks into it
  let query = q
    .from({ sellOrder: sellOrderCollection })
    .leftJoin({ pendingLines: pendingLineCounts }, ({ sellOrder, pendingLines }) =>
      eq(sellOrder.id, pendingLines.sellOrderId),
    )
    .leftJoin({ statusClient: clientCollection }, ({ sellOrder, statusClient }) =>
      eq(sellOrder.clientId, statusClient.id),
    );

  const id = getFilterValue(filters, "id");
  if (id != null) {
    query = query.where(({ sellOrder }) => eq(sellOrder.id, id));
  }
  const clientName = getFilterValue(filters, "clientName");
  if (clientName != null) {
    query = query.fn.where(({ statusClient }) => includesIgnoringAccents(statusClient?.name ?? null, clientName));
  }
  const receptionDate = getFilterValue(filters, "receptionDate");
  if (receptionDate?.startDate != null) {
    const startDate = startOfAppDay(receptionDate.startDate);
    query = query.where(({ sellOrder }) => gte(sellOrder.receptionDate, startDate));
  }
  if (receptionDate?.endDate != null) {
    const endDate = endOfAppDay(receptionDate.endDate);
    query = query.where(({ sellOrder }) => lte(sellOrder.receptionDate, endDate));
  }
  const partId = getFilterValue(filters, "partId");
  if (partId != null) {
    // Grouped so that an order with several lines of the part does not fan out into repeated rows
    const sellOrdersWithPart = q
      .from({ partLine: sellOrderLineCollection })
      .innerJoin({ partLineReference: partReferenceCollection }, ({ partLine, partLineReference }) =>
        eq(partLine.partReferenceId, partLineReference.id),
      )
      .where(({ partLineReference }) => eq(partLineReference.partId, partId))
      .groupBy(groupKeys(({ partLine }) => partLine.sellOrderId))
      .select(({ partLine }) => ({ sellOrderId: partLine.sellOrderId }));
    query = query.innerJoin({ partLines: sellOrdersWithPart }, ({ sellOrder, partLines }) =>
      eq(sellOrder.id, partLines.sellOrderId),
    );
  }

  const statuses = getFilterValue(filters, "statuses");
  if (statuses && statuses.length > 0) {
    query = query.where(({ sellOrder, pendingLines, statusClient }) => {
      const isClientDeleted = and(not(isUndefined(statusClient)), not(isNull(statusClient.deletedAt)));
      return statuses
        .map((status) => {
          switch (status) {
            case SellOrderStatus.Deleted:
              return not(isNull(sellOrder.deletedAt));
            case SellOrderStatus.ClientDeleted:
              return and(isNull(sellOrder.deletedAt), isClientDeleted);
            case SellOrderStatus.Completed:
              return and(isNull(sellOrder.deletedAt), not(isClientDeleted), isUndefined(pendingLines));
            case SellOrderStatus.Pending:
              return and(isNull(sellOrder.deletedAt), not(isClientDeleted), not(isUndefined(pendingLines)));
          }
        })
        .reduce((combined, predicate) => or(combined, predicate));
    });
  }

  return query;
}

function sellOrderSelectProjection(
  q: InitialQueryBuilder,
  { filters, sorts, pagination = null }: TBaseQueryProps<TSellOrderFilters> = {},
) {
  let query = buildFilteredSellOrders(q, filters);

  for (const sort of sorts ?? DEFAULT_SORTING) {
    if (sort.id === "clientName") {
      query = query.orderBy(({ statusClient }) => statusClient.name, {
        direction: sort.desc ? "desc" : "asc",
        nulls: "last",
      });
      continue;
    }
    query = query.orderBy(({ sellOrder }) => sellOrder[sort.id as keyof typeof sellOrder], sort.desc ? "desc" : "asc");
  }

  if (pagination !== null) {
    query = query.limit(pagination.pageSize ?? 10).offset((pagination.pageIndex ?? 0) * (pagination.pageSize ?? 10));
  }

  return query.select(({ sellOrder }) => ({
    ...sellOrder,
    sellOrderLines: materialize(
      q
        .from({ sellOrderLine: sellOrderLineCollection })
        .where(({ sellOrderLine }) => eq(sellOrderLine.sellOrderId, sellOrder.id))
        .select(({ sellOrderLine }) => ({
          ...sellOrderLine,
          partReference: materialize(
            q
              .from({ partReference: partReferenceCollection })
              .where(({ partReference }) => eq(partReference.id, sellOrderLine.partReferenceId))
              .select(({ partReference }) => ({
                ...partReference,
                part: materialize(
                  q
                    .from({ part: partCollection })
                    .where(({ part }) => eq(part.id, partReference.partId))
                    .select(({ part }) => ({
                      ...part,
                      blueprints: materialize(
                        q
                          .from({ blueprint: blueprintCollection })
                          .where(({ blueprint }) => eq(blueprint.partId, part.id)),
                      ),
                    }))
                    .findOne(),
                ),
              }))
              .findOne(),
          ),
        })),
    ),
    client: materialize(
      q
        .from({ client: clientCollection })
        .where(({ client }) => eq(client.id, sellOrder.clientId))
        .findOne(),
    ),
    paymentMethod: materialize(
      q
        .from({ paymentMethod: paymentMethodCollection })
        .where(({ paymentMethod }) => eq(paymentMethod.id, sellOrder.paymentMethodId))
        .findOne(),
    ),
  }));
}

export function useQuerySellOrder({ editSellOrderId, skip = false }: { editSellOrderId?: number; skip?: boolean }) {
  return useLiveQuery((q) => {
    if (skip || editSellOrderId === undefined) return undefined;
    return sellOrderSelectProjection(q)
      .where(({ sellOrder }) => eq(sellOrder.id, editSellOrderId))
      .findOne();
  });
}

export function useQuerySellOrders({
  filters,
  sorts,
  pagination = DEFAULT_PAGINATION,
}: TBaseQueryProps<TSellOrderFilters> = {}) {
  const { data: countData, isReady: isCountReady } = useLiveQuery({
    queryKey: ["sellOrderTableCount", filters],
    query: (q) =>
      q
        .from({
          filteredSellOrder: buildFilteredSellOrders(q, filters).select(({ sellOrder }) => ({ id: sellOrder.id })),
        })
        .select(({ filteredSellOrder }) => ({ count: count(filteredSellOrder.id) })),
  });

  const result = useLiveQuery({
    queryKey: ["sellOrderTable", filters, sorts, pagination],
    query: (q) => sellOrderSelectProjection(q, { filters, sorts, pagination }),
  });

  return { ...result, rowCount: isCountReady ? (countData[0]?.count ?? 0) : null };
}

export function useQuerySellOrderNavigationIds(id?: number) {
  const { data: minSellOrder } = useLiveQuery((q) => {
    if (id === undefined) return undefined;
    return q
      .from({ order: sellOrderCollection })
      .select(({ order }) => ({ id: order.id }))
      .orderBy(({ order }) => order.id, "asc")
      .findOne();
  });
  const { data: maxSellOrder } = useLiveQuery((q) => {
    if (id === undefined) {
      return undefined;
    }
    return q
      .from({ order: sellOrderCollection })
      .select(({ order }) => ({ id: order.id }))
      .orderBy(({ order }) => order.id, "desc")
      .findOne();
  });
  const { data: previousSellOrder } = useLiveQuery((q) => {
    if (id === undefined) {
      return undefined;
    }
    return q
      .from({ order: sellOrderCollection })
      .where(({ order }) => lt(order.id, id))
      .select(({ order }) => ({ id: order.id }))
      .orderBy(({ order }) => order.id, "desc")
      .findOne();
  });
  const { data: nextSellOrder } = useLiveQuery((q) => {
    if (id === undefined) {
      return undefined;
    }
    return q
      .from({ order: sellOrderCollection })
      .where(({ order }) => gt(order.id, id))
      .select(({ order }) => ({ id: order.id }))
      .orderBy(({ order }) => order.id, "asc")
      .findOne();
  });

  return {
    minId: minSellOrder?.id ?? null,
    previousId: previousSellOrder?.id ?? null,
    nextId: nextSellOrder?.id ?? null,
    maxId: maxSellOrder?.id ?? null,
  };
}

export function useQuerySellOrderByClientReference({
  clientId,
  clientReference,
  skip,
}: {
  clientId: number | null;
  clientReference: string | null;
  skip?: boolean;
}) {
  return useLiveQuery((q) => {
    if (skip === true || clientId === null || clientReference === null) return undefined;
    return q
      .from({ sellOrder: sellOrderCollection })
      .where(({ sellOrder }) =>
        and(
          eq(sellOrder.clientId, clientId),
          eq(sellOrder.clientReference, clientReference),
          isNull(sellOrder.deletedAt),
        ),
      )
      .findOne();
  });
}
