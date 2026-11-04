import { TRPCError } from "@trpc/server";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { EmptyFilter } from "drizzle-orm/relations";

import type { TDatabase } from "@/db";
import db from "@/db";
import { dbTableDeliveryNote, dbTableDeliveryNoteLine, dbTableInvoice } from "@/db/schema";

// Only accounted Facturas are written: Electric emits no change for a row whose values did not change, so writing
// one that is already not accounted would leave the client awaiting a txId that never arrives
export async function unaccountInvoice(id: number, dbConnection: TDatabase = db) {
  return (
    await dbConnection
      .update(dbTableInvoice)
      .set({ accounted: false })
      .where(and(eq(dbTableInvoice.id, id), eq(dbTableInvoice.accounted, true)))
      .returning()
  ).at(0);
}

// The content of the Factura changed, so it has to be accounted and sent again. Only a Factura that changes is
// written, for the same reason as in unaccountInvoice
export async function resetInvoiceStatus(id: number, dbConnection: TDatabase = db) {
  return (
    await dbConnection
      .update(dbTableInvoice)
      .set({ accounted: false, sent: false })
      .where(and(eq(dbTableInvoice.id, id), or(eq(dbTableInvoice.accounted, true), eq(dbTableInvoice.sent, true))))
      .returning()
  ).at(0);
}

// The Factura is computed from its Albaranes, so changing one means the Factura has to be accounted and sent again.
// Once it is accounted, only the Administrador can do that.
export async function resetChangedDeliveryNoteInvoice(
  { deliveryNoteId, isAdmin }: { deliveryNoteId: number; isAdmin: boolean },
  dbConnection: TDatabase = db,
): Promise<Array<number>> {
  const deliveryNote = await dbConnection.query.dbTableDeliveryNote.findFirst({
    where: { id: deliveryNoteId },
    with: { invoice: true },
  });
  if (!deliveryNote?.invoice) return [];
  if (deliveryNote.invoice.accounted && !isAdmin) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `El Albarán ${deliveryNote.id} pertenece a una Factura contabilizada, solo el Administrador puede cambiar sus líneas`,
    });
  }
  const resetInvoice = await resetInvoiceStatus(deliveryNote.invoice.id, dbConnection);
  return resetInvoice === undefined ? [] : [resetInvoice.id];
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
  return (
    await dbConnection
      .update(dbTableInvoice)
      .set({ accounted: false, sent: false })
      .where(
        and(
          inArray(dbTableInvoice.id, sellOrderLineInvoiceIds),
          or(eq(dbTableInvoice.accounted, true), eq(dbTableInvoice.sent, true)),
        ),
      )
      .returning({ id: dbTableInvoice.id })
  ).map((invoice) => invoice.id);
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
