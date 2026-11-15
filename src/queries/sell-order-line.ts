import { and, eq, inArray, isNull, useLiveQuery, materialize, not } from "@tanstack/react-db";
import { useMemo } from "react";

import blueprintCollection from "@/collections/blueprint";
import partCollection from "@/collections/part";
import partReferenceCollection from "@/collections/part-reference";
import sellOrderCollection from "@/collections/sell-order";
import sellOrderLineCollection from "@/collections/sell-order-line";
import { sortPendingSellOrderLines } from "@/lib/sell-order-line";
import type { TStagedSellOrderLine } from "@/schemas/delivery-note";

export function useQueryStagedSellOrderLines(stagedSellOrderLines?: Array<TStagedSellOrderLine>) {
  const { data, ...rest } = useLiveQuery({
    query: (q) =>
      q
        .from({ sellOrderLine: sellOrderLineCollection })
        .where(({ sellOrderLine }) => inArray(sellOrderLine.id, stagedSellOrderLines?.map((line) => line.id) ?? []))
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
                    .findOne(),
                ),
              }))
              .findOne(),
          ),
        })),
  });

  const stagedData = useMemo(
    () =>
      data.map((sellOrderLine) => ({
        ...sellOrderLine,
        quantity:
          stagedSellOrderLines?.find((stagedSellOrderLine) => stagedSellOrderLine.id === sellOrderLine.id)?.quantity ??
          sellOrderLine.quantity,
      })),
    [data, stagedSellOrderLines],
  );

  return { ...rest, data: stagedData };
}
export type TStagedSellOrderLineTableRow = NonNullable<ReturnType<typeof useQueryStagedSellOrderLines>["data"]>[number];

export function useQueryPendingSellOrderLines({
  clientId,
  sellOrderId,
}: {
  clientId?: number | null;
  sellOrderId?: number | null;
}) {
  // No Cliente chosen yet has no pending lines
  const hasNoClient = sellOrderId === undefined && clientId === null;
  const { data, ...rest } = useLiveQuery((q) => {
    if ((clientId === undefined && sellOrderId === undefined) || hasNoClient) {
      return undefined;
    }
    const query = q
      .from({ sellOrderLine: sellOrderLineCollection })
      .innerJoin({ sellOrder: sellOrderCollection }, ({ sellOrderLine, sellOrder }) =>
        eq(sellOrderLine.sellOrderId, sellOrder.id),
      )
      .where(({ sellOrderLine, sellOrder }) =>
        and(isNull(sellOrderLine.deletedAt), isNull(sellOrder.deletedAt), not(eq(sellOrderLine.pendingQuantity, 0))),
      )
      .select(({ sellOrderLine, sellOrder }) => ({
        ...sellOrderLine,
        sellOrder,
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
      }));
    if (sellOrderId !== undefined) {
      return query.where(({ sellOrderLine }) => eq(sellOrderLine.sellOrderId, sellOrderId));
    }
    if (clientId !== undefined) {
      return query.where(({ sellOrder }) => eq(sellOrder.clientId, clientId));
    }
    return query;
  });

  const sortedData = useMemo(() => {
    if (hasNoClient) return [];
    return data === undefined ? undefined : sortPendingSellOrderLines(data);
  }, [data, hasNoClient]);

  return { ...rest, data: sortedData };
}
export type TPendingSellOrderLine = NonNullable<ReturnType<typeof useQueryPendingSellOrderLines>["data"]>[number];

export function useQuerySellOrderLineToProduce(sellOrderLineId?: number) {
  return useLiveQuery({
    query: (q) =>
      sellOrderLineId === undefined
        ? undefined
        : q
            .from({ sellOrderLine: sellOrderLineCollection })
            .where(({ sellOrderLine }) => eq(sellOrderLine.id, sellOrderLineId))
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
                  .findOne(),
              ),
            }))
            .findOne(),
  });
}
