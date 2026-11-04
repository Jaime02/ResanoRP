import {
  useLiveQuery,
  and,
  eq,
  gte,
  ilike,
  lte,
  materialize,
  min,
  isNull,
  isUndefined,
  not,
  or,
} from "@tanstack/react-db";

import clientCollection from "@/collections/client";
import partCollection from "@/collections/part";
import partPriceCollection from "@/collections/part-price";
import { endOfAppDay, startOfAppDay } from "@/lib/dates";
import { getAccentInsensitiveLikePattern, includesIgnoringAccents } from "@/lib/utils";
import type { TSort } from "@/schemas";
import type { TPendingPartPriceFilters } from "@/schemas/part-price";
import { getFilterValue } from "@/schemas/utils";
import type { TBaseQueryProps } from "@/types";

export function useQueryPartPrices({
  partId,
  onlyCalculated = false,
  skip = false,
}: {
  partId?: number | null;
  onlyCalculated?: boolean;
  skip?: boolean;
}) {
  return useLiveQuery((q) => {
    if (partId == null || skip) return undefined;
    // The Prices of a deleted Cliente are hidden
    let query = q
      .from({ partPrice: partPriceCollection })
      .leftJoin({ priceClient: clientCollection }, ({ partPrice, priceClient }) =>
        eq(priceClient.id, partPrice.clientId),
      )
      .where(({ partPrice, priceClient }) =>
        and(eq(partPrice.partId, partId), or(isUndefined(priceClient), isNull(priceClient.deletedAt))),
      );
    if (onlyCalculated) {
      query = query.where(({ partPrice }) => not(isNull(partPrice.price)));
    }
    return query
      .select(({ partPrice, priceClient }) => ({ ...partPrice, client: priceClient }))
      .orderBy(({ partPrice }) => partPrice.createdAt, "desc");
  });
}
export type TPartPrice = NonNullable<ReturnType<typeof useQueryPartPrices>["data"]>[number];

const DEFAULT_PENDING_SORTING: Array<TSort> = [{ id: "description", desc: false }];

export function useQueryPendingPartPrices({ filters, sorts }: TBaseQueryProps<TPendingPartPriceFilters> = {}) {
  return useLiveQuery({
    queryKey: ["pendingPartPrices", filters, sorts],
    query: (q) => {
      let pendingPartPrices = q
        .from({ pendingPartPrice: partPriceCollection })
        .leftJoin({ client: clientCollection }, ({ pendingPartPrice, client }) =>
          eq(pendingPartPrice.clientId, client.id),
        )
        .where(({ pendingPartPrice, client }) =>
          and(isNull(pendingPartPrice.price), or(isUndefined(client), isNull(client.deletedAt))),
        );

      const quantity = getFilterValue(filters, "quantity");
      if (quantity != null) {
        pendingPartPrices = pendingPartPrices.where(({ pendingPartPrice }) => eq(pendingPartPrice.quantity, quantity));
      }
      const clientName = getFilterValue(filters, "clientName");
      if (clientName != null) {
        pendingPartPrices = pendingPartPrices.fn.where(({ client }) =>
          includesIgnoringAccents(client?.name ?? null, clientName),
        );
      }
      const createdAt = getFilterValue(filters, "createdAt");
      if (createdAt?.startDate != null) {
        const startDate = startOfAppDay(createdAt.startDate);
        pendingPartPrices = pendingPartPrices.where(({ pendingPartPrice }) =>
          gte(pendingPartPrice.createdAt, startDate),
        );
      }
      if (createdAt?.endDate != null) {
        const endDate = endOfAppDay(createdAt.endDate);
        pendingPartPrices = pendingPartPrices.where(({ pendingPartPrice }) => lte(pendingPartPrice.createdAt, endDate));
      }

      const pendingPartPricesByPart = pendingPartPrices
        .groupBy(({ pendingPartPrice }) => pendingPartPrice.partId)
        .select(({ pendingPartPrice }) => ({
          partId: pendingPartPrice.partId,
          createdAt: min(pendingPartPrice.createdAt),
        }));

      let query = q
        .from({ part: partCollection })
        .where(({ part }) => isNull(part.deletedAt))
        .innerJoin({ pending: pendingPartPricesByPart }, ({ part, pending }) => eq(pending.partId, part.id));

      const description = getFilterValue(filters, "description");
      if (description != null) {
        query = query
          .where(({ part }) => ilike(part.description, getAccentInsensitiveLikePattern(description)))
          .fn.where(({ part }) => includesIgnoringAccents(part.description, description));
      }

      for (const sort of sorts ?? DEFAULT_PENDING_SORTING) {
        const direction = sort.desc ? "desc" : "asc";
        query =
          sort.id === "createdAt"
            ? query.orderBy(({ pending }) => pending.createdAt, direction)
            : query.orderBy(({ part }) => part[sort.id as keyof typeof part], direction);
      }

      return query.select(({ part }) => ({
        ...part,
        pendingPartPrices: materialize(
          q
            .from({ partPrice: partPriceCollection })
            .leftJoin({ priceClient: clientCollection }, ({ partPrice, priceClient }) =>
              eq(priceClient.id, partPrice.clientId),
            )
            .where(({ partPrice, priceClient }) =>
              and(
                eq(partPrice.partId, part.id),
                isNull(partPrice.price),
                or(isUndefined(priceClient), isNull(priceClient.deletedAt)),
              ),
            )
            .select(({ partPrice, priceClient }) => ({ ...partPrice, client: priceClient }))
            .orderBy(({ partPrice }) => partPrice.createdAt, "asc"),
        ),
      }));
    },
  });
}
export type TPendingPartPrice = NonNullable<ReturnType<typeof useQueryPendingPartPrices>["data"]>[number];

export function useQueryPartPrice({ partPriceId, skip = false }: { partPriceId?: number; skip?: boolean }) {
  return useLiveQuery((q) => {
    if (skip || partPriceId === undefined) {
      return undefined;
    }
    return q
      .from({ partPrice: partPriceCollection })
      .where(({ partPrice }) => eq(partPrice.id, partPriceId))
      .select(({ partPrice }) => ({
        ...partPrice,
      }))
      .findOne();
  });
}
