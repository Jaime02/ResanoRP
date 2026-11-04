import type { InitialQueryBuilder } from "@tanstack/react-db";
import { count, eq, isNull, materialize, useLiveQuery } from "@tanstack/react-db";
import { useMemo } from "react";

import clientCollection from "@/collections/client";
import deliveryNoteCollection from "@/collections/delivery-note";
import deliveryNoteLineCollection from "@/collections/delivery-note-line";
import invoiceCollection from "@/collections/invoice";
import partReferenceCollection from "@/collections/part-reference";
import sellOrderCollection from "@/collections/sell-order";
import sellOrderLineCollection from "@/collections/sell-order-line";
import { getDeliveryNoteLineUnitPrice, getLinesTotalInCents, getTotalWithVatInCents } from "@/lib/prices";
import type { TSort } from "@/schemas";
import type { TInvoiceFilters, TTableInvoiceState } from "@/schemas/invoice";
import { getFilterValue } from "@/schemas/utils";
import { DEFAULT_PAGINATION } from "@/types";

export const DEFAULT_INVOICE_SORTING: Array<TSort> = [{ desc: true, id: "id" }];

function buildFilteredInvoices(q: InitialQueryBuilder, filters?: TInvoiceFilters) {
  let query = q.from({ invoice: invoiceCollection });

  if (getFilterValue(filters, "id") != null) {
    query = query.where(({ invoice }) => eq(invoice.id, getFilterValue(filters, "id")));
  }
  if (getFilterValue(filters, "clientId") != null) {
    query = query.where(({ invoice }) => eq(invoice.clientId, getFilterValue(filters, "clientId")));
  }
  if (getFilterValue(filters, "accounted") != null) {
    query = query.where(({ invoice }) => eq(invoice.accounted, getFilterValue(filters, "accounted")));
  }
  if (getFilterValue(filters, "sent") != null) {
    query = query.where(({ invoice }) => eq(invoice.sent, getFilterValue(filters, "sent")));
  }

  return query;
}

export function useQueryInvoiceTable({
  filters,
  pagination = DEFAULT_PAGINATION,
  sorts = DEFAULT_INVOICE_SORTING,
}: TTableInvoiceState = {}) {
  const { data: countData, isReady: isCountReady } = useLiveQuery({
    query: (q) => buildFilteredInvoices(q, filters).select(({ invoice }) => ({ count: count(invoice.id) })),
  });

  const { data, ...rest } = useLiveQuery({
    query: (q) => {
      let query = buildFilteredInvoices(q, filters);

      for (const sort of sorts) {
        query = query.orderBy(({ invoice }) => invoice[sort.id as keyof typeof invoice], sort.desc ? "desc" : "asc");
      }

      if (pagination !== null) {
        query = query
          .limit(pagination.pageSize ?? 10)
          .offset((pagination.pageIndex ?? 0) * (pagination.pageSize ?? 10));
      }

      return query.select(({ invoice }) => ({
        ...invoice,
        client: materialize(
          q
            .from({ client: clientCollection })
            .where(({ client }) => eq(client.id, invoice.clientId))
            .findOne(),
        ),
        deliveryNotes: materialize(
          q
            .from({ deliveryNote: deliveryNoteCollection })
            .where(({ deliveryNote }) => eq(deliveryNote.invoiceId, invoice.id))
            .orderBy(({ deliveryNote }) => deliveryNote.id, "asc")
            .select(({ deliveryNote }) => ({
              ...deliveryNote,
              deliveryNoteLines: materialize(
                q
                  .from({ deliveryNoteLine: deliveryNoteLineCollection })
                  .where(({ deliveryNoteLine }) => eq(deliveryNoteLine.deliveryNoteId, deliveryNote.id))
                  .select(({ deliveryNoteLine }) => ({
                    ...deliveryNoteLine,
                    sellOrderLine: materialize(
                      q
                        .from({ sellOrderLine: sellOrderLineCollection })
                        .where(({ sellOrderLine }) => eq(sellOrderLine.id, deliveryNoteLine.sellOrderLineId))
                        .findOne(),
                    ),
                  })),
              ),
            })),
        ),
      }));
    },
  });

  const invoices = useMemo(
    () =>
      data.map((invoice) => {
        const deliveryNotes = invoice.deliveryNotes.map((deliveryNote) => ({
          ...deliveryNote,
          deliveryNoteLines: deliveryNote.deliveryNoteLines.map((deliveryNoteLine) => ({
            ...deliveryNoteLine,
            unitPrice: getDeliveryNoteLineUnitPrice(deliveryNoteLine),
          })),
        }));
        const invoiceLines = deliveryNotes.flatMap((deliveryNote) => deliveryNote.deliveryNoteLines);
        return {
          ...invoice,
          deliveryNotes: deliveryNotes.map((deliveryNote) => ({
            ...deliveryNote,
            totalInCents: getLinesTotalInCents(deliveryNote.deliveryNoteLines),
          })),
          taxableBaseInCents: getLinesTotalInCents(invoiceLines),
          totalInCents: getTotalWithVatInCents(invoiceLines),
        };
      }),
    [data],
  );

  return { ...rest, data: invoices, rowCount: isCountReady ? (countData[0]?.count ?? 0) : null };
}

export type TInvoiceTableRow = NonNullable<ReturnType<typeof useQueryInvoiceTable>["data"][number]>;
export type TInvoiceDeliveryNote = TInvoiceTableRow["deliveryNotes"][number];

export function useQueryPendingDeliveryNotes(clientId: number | null) {
  return useLiveQuery((q) => {
    let query = q
      .from({ deliveryNote: deliveryNoteCollection })
      .where(({ deliveryNote }) => isNull(deliveryNote.invoiceId));
    if (clientId !== null) {
      query = query.where(({ deliveryNote }) => eq(deliveryNote.clientId, clientId));
    }
    return query
      .orderBy(({ deliveryNote }) => deliveryNote.deliveryDate, "asc")
      .orderBy(({ deliveryNote }) => deliveryNote.id, "asc")
      .select(({ deliveryNote }) => ({
        ...deliveryNote,
        client: materialize(
          q
            .from({ client: clientCollection })
            .where(({ client }) => eq(client.id, deliveryNote.clientId))
            .findOne(),
        ),
        deliveryNoteLines: materialize(
          q
            .from({ deliveryNoteLine: deliveryNoteLineCollection })
            .where(({ deliveryNoteLine }) => eq(deliveryNoteLine.deliveryNoteId, deliveryNote.id))
            .orderBy(({ deliveryNoteLine }) => deliveryNoteLine.id, "asc")
            .select(({ deliveryNoteLine }) => ({
              ...deliveryNoteLine,
              partReference: materialize(
                q
                  .from({ partReference: partReferenceCollection })
                  .where(({ partReference }) => eq(partReference.id, deliveryNoteLine.partReferenceId))
                  .findOne(),
              ),
              sellOrderLine: materialize(
                q
                  .from({ sellOrderLine: sellOrderLineCollection })
                  .where(({ sellOrderLine }) => eq(sellOrderLine.id, deliveryNoteLine.sellOrderLineId))
                  .select(({ sellOrderLine }) => ({
                    ...sellOrderLine,
                    sellOrder: materialize(
                      q
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
  });
}
