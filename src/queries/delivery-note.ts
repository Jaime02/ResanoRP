import type { InitialQueryBuilder } from "@tanstack/react-db";
import { count, eq, useLiveQuery, max, materialize } from "@tanstack/react-db";
import { useEffect, useState } from "react";

import clientCollection from "@/collections/client";
import deliveryNoteCollection from "@/collections/delivery-note";
import deliveryNoteLineCollection from "@/collections/delivery-note-line";
import invoiceCollection from "@/collections/invoice";
import partCollection from "@/collections/part";
import partReferenceCollection from "@/collections/part-reference";
import sellOrderCollection from "@/collections/sell-order";
import sellOrderLineCollection from "@/collections/sell-order-line";
import type { TSort } from "@/schemas";
import type { TDeliveryNoteFilters } from "@/schemas/delivery-note";
import { getFilterValue } from "@/schemas/utils";
import trpc from "@/trpc/trpc-client";
import { DEFAULT_PAGINATION, type TBaseQueryProps } from "@/types";

export function useQueryNextDeliveryNoteId({ skip = false }: { skip?: boolean } = {}): number | null {
  const [nextId, setNextId] = useState<number | null>(null);

  // A delivery note created by another user moves the sequence, and arrives here as a new max id
  const { data: maxIdData } = useLiveQuery((q) => {
    if (skip) return undefined;
    return q
      .from({ deliveryNote: deliveryNoteCollection })
      .select(({ deliveryNote }) => ({ maxId: max(deliveryNote.id) }));
  });
  const maxId = maxIdData?.at(0)?.maxId;

  useEffect(() => {
    if (skip) return;
    let ignore = false;
    void trpc.deliveryNote.nextId.query().then((id) => {
      if (!ignore) setNextId(id);
    });
    return () => {
      ignore = true;
    };
  }, [skip, maxId]);

  return skip ? null : nextId;
}

const DEFAULT_SORTING: Array<TSort> = [{ id: "id", desc: true }];

function buildFilteredDeliveryNotes(query: InitialQueryBuilder, filters?: TDeliveryNoteFilters) {
  let q = query.from({ deliveryNote: deliveryNoteCollection });
  if (getFilterValue(filters, "clientId") != null) {
    q = q.where(({ deliveryNote }) => eq(deliveryNote.clientId, getFilterValue(filters, "clientId")));
  }
  if (getFilterValue(filters, "partId") != null) {
    q = q
      .innerJoin({ deliveryNoteLines: deliveryNoteLineCollection }, ({ deliveryNoteLines, deliveryNote }) =>
        eq(deliveryNoteLines.deliveryNoteId, deliveryNote.id),
      )
      .innerJoin({ partReference: partReferenceCollection }, ({ partReference, deliveryNoteLines }) =>
        eq(partReference.id, deliveryNoteLines.partReferenceId),
      )
      .where(({ partReference }) => eq(partReference.partId, getFilterValue(filters, "partId")));
  }
  if (getFilterValue(filters, "id") != null) {
    q = q.where(({ deliveryNote }) => eq(deliveryNote.id, getFilterValue(filters, "id")));
  }
  return q;
}

function deliveryNoteSelectProjection({
  query,
  filters,
  pagination = DEFAULT_PAGINATION,
  sorts,
}: {
  query: InitialQueryBuilder;
} & TBaseQueryProps<TDeliveryNoteFilters>) {
  let q = buildFilteredDeliveryNotes(query, filters).leftJoin(
    { sortClient: clientCollection },
    ({ deliveryNote, sortClient }) => eq(deliveryNote.clientId, sortClient.id),
  );

  for (const sort of sorts ?? DEFAULT_SORTING) {
    if (sort.id === "client") {
      q = q.orderBy(({ sortClient }) => sortClient.name, { direction: sort.desc ? "desc" : "asc", nulls: "last" });
      continue;
    }
    q = q.orderBy(({ deliveryNote }) => deliveryNote[sort.id as keyof typeof deliveryNote], sort.desc ? "desc" : "asc");
  }

  if (pagination !== null) {
    q = q.limit(pagination.pageSize ?? 10).offset((pagination.pageIndex ?? 0) * (pagination.pageSize ?? 10));
  }

  const projected = q.select(({ deliveryNote }) => ({
    ...deliveryNote,
    client: materialize(
      query
        .from({ client: clientCollection })
        .where(({ client }) => eq(client.id, deliveryNote.clientId))
        .findOne(),
    ),
    deliveryNoteLines: materialize(
      query
        .from({ deliveryNoteLine: deliveryNoteLineCollection })
        .where(({ deliveryNoteLine }) => eq(deliveryNoteLine.deliveryNoteId, deliveryNote.id))
        .select(({ deliveryNoteLine }) => ({
          ...deliveryNoteLine,
          partReference: materialize(
            query
              .from({ deliveryNoteLinePartReference: partReferenceCollection })
              .where(({ deliveryNoteLinePartReference }) =>
                eq(deliveryNoteLinePartReference.id, deliveryNoteLine.partReferenceId),
              )
              .select(({ deliveryNoteLinePartReference }) => ({
                ...deliveryNoteLinePartReference,
                part: materialize(
                  query
                    .from({ part: partCollection })
                    .where(({ part }) => eq(part.id, deliveryNoteLinePartReference.partId))
                    .findOne(),
                ),
              }))
              .findOne(),
          ),
          sellOrderLine: materialize(
            query
              .from({ sellOrderLine: sellOrderLineCollection })
              .where(({ sellOrderLine }) => eq(sellOrderLine.id, deliveryNoteLine.sellOrderLineId))
              .select(({ sellOrderLine }) => ({
                ...sellOrderLine,
                sellOrder: materialize(
                  query
                    .from({ sellOrder: sellOrderCollection })
                    .where(({ sellOrder }) => eq(sellOrder.id, sellOrderLine.sellOrderId))
                    .findOne(),
                ),
              }))
              .findOne(),
          ),
        })),
    ),
  }));

  // The Line join of the part filter fans an Albarán out into several rows.
  return getFilterValue(filters, "partId") != null ? projected.distinct() : projected;
}

export function useQueryDeliveryNotes({ filters, pagination, sorts }: TBaseQueryProps<TDeliveryNoteFilters> = {}) {
  const { data: countData, isReady: isCountReady } = useLiveQuery({
    query: (q) => {
      const filtered = buildFilteredDeliveryNotes(q, filters)
        .select(({ deliveryNote }) => ({ id: deliveryNote.id }))
        .distinct();
      return q
        .from({ filteredDeliveryNote: filtered })
        .select(({ filteredDeliveryNote }) => ({ count: count(filteredDeliveryNote.id) }));
    },
  });

  const result = useLiveQuery({
    query: (query) => deliveryNoteSelectProjection({ query, filters, pagination, sorts }),
  });

  return { ...result, rowCount: isCountReady ? (countData[0]?.count ?? 0) : null };
}

export function useQueryDeliveryNoteById({
  deliveryNoteId,
  skip = false,
}: {
  deliveryNoteId?: number;
  skip?: boolean;
}) {
  return useLiveQuery((query) => {
    if (deliveryNoteId === undefined || skip) return undefined;
    return deliveryNoteSelectProjection({ query, filters: [{ id: "id", value: deliveryNoteId }] }).findOne();
  });
}

export type TDeliveryNote = NonNullable<ReturnType<typeof useQueryDeliveryNoteById>["data"]>;
export type TDeliveryNoteLine = NonNullable<TDeliveryNote["deliveryNoteLines"]>[number];

export function useQueryClientDeliveryNotesWithInvoiceStatus(clientId: number | null) {
  return useLiveQuery((query) => {
    if (clientId === null) {
      return undefined;
    }
    return query
      .from({ deliveryNote: deliveryNoteCollection })
      .leftJoin({ invoice: invoiceCollection }, ({ deliveryNote, invoice }) => eq(deliveryNote.invoiceId, invoice.id))
      .where(({ deliveryNote }) => eq(deliveryNote.clientId, clientId))
      .orderBy(({ deliveryNote }) => deliveryNote.id, "desc")
      .select(({ deliveryNote, invoice }) => ({
        ...deliveryNote,
        invoiceAccounted: invoice.accounted,
      }));
  });
}
