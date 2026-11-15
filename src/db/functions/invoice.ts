import { TRPCError } from "@trpc/server";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { EmptyFilter } from "drizzle-orm/relations";

import type { TDatabase } from "@/db";
import db from "@/db";
import { dbTableDeliveryNote, dbTableDeliveryNoteLine, dbTableInvoice } from "@/db/schema";
import { ACCOUNTED_DELIVERY_NOTE_MESSAGE } from "@/messages/delivery-note";

export async function unaccountInvoice(id: number, dbConnection: TDatabase = db) {
  return (
    await dbConnection
      .update(dbTableInvoice)
      .set({ accounted: false })
      .where(and(eq(dbTableInvoice.id, id), eq(dbTableInvoice.accounted, true)))
      .returning()
  ).at(0);
}

// The content of the Factura changed, so it has to be accounted and sent again
export async function resetInvoiceStatus(id: number, dbConnection: TDatabase = db) {
  await dbConnection
    .update(dbTableInvoice)
    .set({ accounted: false, sent: false })
    .where(and(eq(dbTableInvoice.id, id), or(eq(dbTableInvoice.accounted, true), eq(dbTableInvoice.sent, true))));
}

// The Factura is computed from its Albaranes, so changing one means the Factura has to be accounted and sent again.
// Once it is accounted, only the Administrador can do that.
export async function resetChangedDeliveryNoteInvoice(
  { deliveryNoteId, isAdmin }: { deliveryNoteId: number; isAdmin: boolean },
  dbConnection: TDatabase = db,
): Promise<void> {
  const deliveryNote = await dbConnection.query.dbTableDeliveryNote.findFirst({
    where: { id: deliveryNoteId },
    with: { invoice: true },
  });
  if (!deliveryNote?.invoice) return;
  if (deliveryNote.invoice.accounted && !isAdmin) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: ACCOUNTED_DELIVERY_NOTE_MESSAGE(deliveryNote.id),
    });
  }
  await resetInvoiceStatus(deliveryNote.invoice.id, dbConnection);
}

// The Líneas del Albarán of a Línea del Pedido de venta take its price, unless they have their own, so the Facturas of
// their Albaranes change with it
export async function resetSellOrderLineInvoices(sellOrderLineId: number, dbConnection: TDatabase = db) {
  const sellOrderLineInvoiceIds = dbConnection
    .select({ id: dbTableDeliveryNote.invoiceId })
    .from(dbTableDeliveryNote)
    .innerJoin(dbTableDeliveryNoteLine, eq(dbTableDeliveryNoteLine.deliveryNoteId, dbTableDeliveryNote.id))
    .where(
      and(eq(dbTableDeliveryNoteLine.sellOrderLineId, sellOrderLineId), isNull(dbTableDeliveryNoteLine.unitPrice)),
    );
  await dbConnection
    .update(dbTableInvoice)
    .set({ accounted: false, sent: false })
    .where(
      and(
        inArray(dbTableInvoice.id, sellOrderLineInvoiceIds),
        or(eq(dbTableInvoice.accounted, true), eq(dbTableInvoice.sent, true)),
      ),
    );
}

export async function sendInvoice(id: number, dbConnection: TDatabase = db) {
  return (
    await dbConnection
      .update(dbTableInvoice)
      .set({ sent: true })
      .where(and(eq(dbTableInvoice.id, id), eq(dbTableInvoice.sent, false)))
      .returning()
  ).at(0);
}

export function getInvoiceById(id: number, dbConnection: TDatabase = db) {
  return dbConnection.query.dbTableInvoice.findFirst({
    where: { id },
    with: { deliveryNotes: true },
  });
}

export function getInvoiceWithClientInvoiceEmails(id: number, dbConnection: TDatabase = db) {
  return dbConnection.query.dbTableInvoice.findFirst({
    where: { id },
    with: { client: { with: { invoiceEmails: true } } },
  });
}

export function getInvoices(dbConnection: TDatabase = db) {
  return dbConnection.query.dbTableInvoice.findMany({
    with: { deliveryNotes: true },
    orderBy: { id: "asc" },
  });
}

export function getInvoiceForDocument(id: number, dbConnection: TDatabase = db) {
  return dbConnection.query.dbTableInvoice.findFirst({
    where: { id },
    with: {
      client: true,
      deliveryNotes: {
        orderBy: { id: "asc" },
        with: {
          deliveryNoteLines: {
            orderBy: { id: "asc" },
            with: {
              partReference: true,
              sellOrderLine: { with: { sellOrder: true } },
            },
          },
        },
      },
      paymentMethod: true,
    },
  });
}

export function getInvoicesForAccountingExport(ids: Array<number>, dbConnection: TDatabase = db) {
  return dbConnection.query.dbTableInvoice.findMany({
    where: { id: { in: ids } },
    orderBy: { id: "asc" },
    with: {
      client: true,
      deliveryNotes: {
        with: {
          deliveryNoteLines: { with: { sellOrderLine: true } },
        },
      },
      paymentMethod: true,
    },
  });
}

interface GetDeliveryNotesToInvoiceProps {
  clientId: number;
  startDate?: Date;
  endDate?: Date;
}

export function getDeliveryNotesToInvoice(
  { clientId, startDate, endDate }: GetDeliveryNotesToInvoiceProps,
  dbConnection: TDatabase = db,
) {
  return dbConnection.query.dbTableDeliveryNote.findMany({
    where: {
      clientId,
      deliveryDate: { gte: startDate ?? EmptyFilter, lte: endDate ?? EmptyFilter },
      invoiceId: { isNull: true },
    },
    orderBy: { id: "asc" },
  });
}
