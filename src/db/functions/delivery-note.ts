import { sql } from "drizzle-orm";

import type { TDatabase } from "@/db";
import db from "@/db";
import { getDeliveryNoteLinesByDeliveryNoteId } from "@/db/functions/delivery-note-line";
import type { BaseDeliveryNote } from "@/types/delivery-note";
import type { BaseSellOrderLine } from "@/types/sell-order-line";

interface GetDeliveryNoteProps {
  id: number;
}

export async function getNextDeliveryNoteId(dbConnection: TDatabase = db): Promise<number> {
  // A restarted sequence, or one set with is_called false, hands out its last value next
  const result: { rows: Array<{ nextId: number }> } = await dbConnection.execute(
    sql`SELECT (CASE WHEN is_called THEN last_value + 1 ELSE last_value END)::int AS "nextId" FROM delivery_note_id_seq`,
  );
  return result.rows[0].nextId;
}

export async function getDeliveryNote(
  { id }: GetDeliveryNoteProps,
  dbConnection: TDatabase = db,
): Promise<BaseDeliveryNote | undefined> {
  return dbConnection.query.dbTableDeliveryNote.findFirst({ where: { id } });
}

export async function getSellOrderLinesByDeliveryNoteId(
  deliveryNoteId: number,
  dbConnection: TDatabase = db,
): Promise<Array<BaseSellOrderLine>> {
  const deliveryNoteLines = await getDeliveryNoteLinesByDeliveryNoteId(deliveryNoteId, dbConnection);
  if (deliveryNoteLines.length === 0) {
    return [];
  }
  return dbConnection.query.dbTableSellOrderLine.findMany({
    where: {
      id: { in: deliveryNoteLines.map((line) => line.sellOrderLineId).filter((id): id is number => id !== null) },
    },
  });
}

export async function getDeliveryNotes(dbConnection: TDatabase = db): Promise<Array<BaseDeliveryNote>> {
  return dbConnection.query.dbTableDeliveryNote.findMany({ orderBy: { id: "asc" } });
}

export async function getDeliveryNoteWithLinesForDocument(id: number, dbConnection: TDatabase = db) {
  return dbConnection.query.dbTableDeliveryNote.findFirst({
    where: { id },
    with: {
      client: true,
      deliveryMethod: true,
      deliveryNoteLines: {
        with: {
          partReference: true,
          sellOrderLine: { with: { sellOrder: true } },
        },
      },
    },
  });
}
