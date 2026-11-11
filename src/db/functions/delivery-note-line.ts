import { TRPCError } from "@trpc/server";
import { and, eq, ne, sql } from "drizzle-orm";

import type { TDatabase } from "@/db";
import db from "@/db";
import { dbTableDeliveryNoteLine, dbTableSellOrderLine } from "@/db/schema";
import { PENDING_QUANTITY_EXCEEDED_MESSAGE } from "@/messages/delivery-note";
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

export async function addSellOrderLinePendingQuantity(
  sellOrderLineId: number | null,
  quantity: number,
  dbConnection: TDatabase = db,
): Promise<void> {
  if (sellOrderLineId === null) return;
  const newPendingQuantity = sql<number>`least(greatest(${dbTableSellOrderLine.pendingQuantity} + ${quantity}, least(${dbTableSellOrderLine.quantity}, 0)), greatest(${dbTableSellOrderLine.quantity}, 0))`;

  // The sum is done by the database in the same statement, so two changes at the same time do not overwrite each other.
  // The pendingQuantity is clamped between 0 and the ordered quantity, which is negative for a return.
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
