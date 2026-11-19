import { TRPCError } from "@trpc/server";
import { and, eq, ne, sql } from "drizzle-orm";

import type { TDatabase } from "@/db";
import db from "@/db";
import { getSellOrderLineForUpdate } from "@/db/functions/sell-order-line";
import { dbTableDeliveryNote, dbTableDeliveryNoteLine, dbTableSellOrderLine } from "@/db/schema";
import {
  CLIENT_SPLITS_SELL_ORDERS_MESSAGE,
  PENDING_QUANTITY_EXCEEDED_MESSAGE,
  SELL_ORDER_LINE_ALREADY_DELIVERED_MESSAGE,
} from "@/messages/delivery-note";
import type { BaseDeliveryNoteLine } from "@/types/delivery-note-line";

interface TDeleteDeliveryNoteLineResult {
  deletedDeliveryNoteLine: BaseDeliveryNoteLine;
}

export async function deleteDeliveryNoteLine(
  id: number,
  dbConnection: TDatabase = db,
): Promise<TDeleteDeliveryNoteLineResult> {
  const deletedDeliveryNoteLine = (
    await dbConnection.delete(dbTableDeliveryNoteLine).where(eq(dbTableDeliveryNoteLine.id, id)).returning()
  ).at(0);

  if (deletedDeliveryNoteLine === undefined) {
    throw new Error(`Línea del Albarán con ID ${id} no encontrada`);
  }

  // Waits for an Albarán of the same Línea de pedido being created, so the delivered sum of the next statement sees it
  if (deletedDeliveryNoteLine.sellOrderLineId !== null) {
    await getSellOrderLineForUpdate(deletedDeliveryNoteLine.sellOrderLineId, dbConnection);
  }
  await addSellOrderLinePendingQuantity(
    deletedDeliveryNoteLine.sellOrderLineId,
    deletedDeliveryNoteLine.quantity,
    dbConnection,
  );
  return { deletedDeliveryNoteLine };
}

// The pendingQuantity is clamped, so giving back more than was delivered would be lost, and deleting or editing the
// Línea of the Albarán later would take away parts that are still pending
export function assertPendingQuantityWithinQuantity(
  sellOrderLine: { id: number; pendingQuantity: number; quantity: number },
  quantity: number,
) {
  const newPendingQuantity = sellOrderLine.pendingQuantity + quantity;
  if (
    sellOrderLine.quantity > 0
      ? newPendingQuantity > sellOrderLine.quantity
      : newPendingQuantity < sellOrderLine.quantity
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: PENDING_QUANTITY_EXCEEDED_MESSAGE(sellOrderLine.id),
    });
  }
}

// Delivering more than ordered is allowed while something is pending, but a Línea that is already delivered must not be
// delivered again, which is what two Albaranes sent at the same time would do
export function assertSellOrderLineNotDelivered(sellOrderLine: { id: number; pendingQuantity: number }) {
  if (sellOrderLine.pendingQuantity === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: SELL_ORDER_LINE_ALREADY_DELIVERED_MESSAGE(sellOrderLine.id),
    });
  }
}

// The caller must hold lockDeliveryNote, or two Pedidos added at the same time both pass against the old lines
export async function assertDeliveryNoteHasNoOtherSellOrder(
  deliveryNoteId: number,
  sellOrderId: number,
  tx: TDatabase,
) {
  const lineOfOtherSellOrder = await tx
    .select({ id: dbTableDeliveryNoteLine.id })
    .from(dbTableDeliveryNoteLine)
    .innerJoin(dbTableSellOrderLine, eq(dbTableDeliveryNoteLine.sellOrderLineId, dbTableSellOrderLine.id))
    .where(
      and(
        eq(dbTableDeliveryNoteLine.deliveryNoteId, deliveryNoteId),
        ne(dbTableSellOrderLine.sellOrderId, sellOrderId),
      ),
    )
    .limit(1);
  if (lineOfOtherSellOrder.length > 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: CLIENT_SPLITS_SELL_ORDERS_MESSAGE,
    });
  }
}

// Locked until the transaction ends. Taken before any Línea de pedido is locked, so transactions lock in one order.
// No key: a plain update lock would also wait for every Línea inserted into the Albarán, whose foreign key shares it
export async function lockDeliveryNote(deliveryNoteId: number, tx: TDatabase) {
  await tx
    .select({ id: dbTableDeliveryNote.id })
    .from(dbTableDeliveryNote)
    .where(eq(dbTableDeliveryNote.id, deliveryNoteId))
    .for("no key update");
}

const deliveredQuantitySql = (sellOrderLineId: number) =>
  sql`select coalesce(sum(${dbTableDeliveryNoteLine.quantity}), 0)::integer from ${dbTableDeliveryNoteLine} where ${dbTableDeliveryNoteLine.sellOrderLineId} = ${sellOrderLineId}`;

export async function getSellOrderLineDeliveredQuantity(
  sellOrderLineId: number,
  dbConnection: TDatabase = db,
): Promise<number> {
  const result: { rows: Array<{ deliveredQuantity: number }> } = await dbConnection.execute(
    sql`select (${deliveredQuantitySql(sellOrderLineId)}) as "deliveredQuantity"`,
  );
  return result.rows[0].deliveredQuantity;
}

export async function addSellOrderLinePendingQuantity(
  sellOrderLineId: number | null,
  quantity: number,
  dbConnection: TDatabase = db,
): Promise<void> {
  if (sellOrderLineId === null) return;
  const notDeliveredQuantity = sql`${dbTableSellOrderLine.quantity} - (${deliveredQuantitySql(sellOrderLineId)})`;
  const newPendingQuantity = sql<number>`least(greatest(${dbTableSellOrderLine.pendingQuantity} + ${quantity}, least(${dbTableSellOrderLine.quantity}, 0), least(${notDeliveredQuantity}, 0)), greatest(${dbTableSellOrderLine.quantity}, 0), greatest(${notDeliveredQuantity}, 0))`;

  // The sum is done by the database in the same statement, so two changes at the same time do not overwrite each other.
  // Mirrors clampPendingQuantity: an over-delivery is not stored in the pendingQuantity, so without the limit of what was
  // not delivered, deleting an earlier Línea after it would give back parts that were already delivered. That limit wins
  // over a pendingQuantity typed by hand.
  await dbConnection
    .update(dbTableSellOrderLine)
    .set({ pendingQuantity: newPendingQuantity })
    .where(
      and(eq(dbTableSellOrderLine.id, sellOrderLineId), ne(dbTableSellOrderLine.pendingQuantity, newPendingQuantity)),
    );
}

interface GetDeliveryNoteLineProps {
  id: number;
}

export async function getDeliveryNoteLine(
  { id }: GetDeliveryNoteLineProps,
  dbConnection: TDatabase = db,
): Promise<BaseDeliveryNoteLine | undefined> {
  return dbConnection.query.dbTableDeliveryNoteLine.findFirst({ where: { id } });
}

export async function getDeliveryNoteLinesByDeliveryNoteId(
  deliveryNoteId: number,
  dbConnection: TDatabase = db,
): Promise<Array<BaseDeliveryNoteLine>> {
  return dbConnection.query.dbTableDeliveryNoteLine.findMany({
    where: { deliveryNoteId },
  });
}
