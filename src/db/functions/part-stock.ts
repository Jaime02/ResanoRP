import { eq, getColumns, sql } from "drizzle-orm";

import type { TDatabase } from "@/db";
import db from "@/db";
import {
  dbTableDeliveryNote,
  dbTableDeliveryNoteLine,
  dbTablePartProduction,
  dbTablePartReference,
  dbTablePartStock,
  dbTableProductionOrder,
} from "@/db/schema";
import { buildStockLedger } from "@/queries/part-stock";

export async function getLatestPartStockTransactionByPartId(partId: number, dbConnection: TDatabase = db) {
  return (await getPartStockTransactionsQuery(partId, dbConnection)).at(0);
}

export async function getLatestPartStockTransactionsByIds(partIds: Array<number>, dbConnection: TDatabase = db) {
  const promises = partIds.map(async (id) => {
    const transaction = await getLatestPartStockTransactionByPartId(id, dbConnection);
    return [id, transaction] as const;
  });
  return new Map(await Promise.all(promises));
}

async function getPartStockTransactionsQuery(partId: number, dbConnection: TDatabase = db) {
  const productions = await dbConnection
    .select({
      __typename: sql<"PartProduction">`'PartProduction'`.as("__typename"),
      ...getColumns(dbTablePartProduction),
    })
    .from(dbTablePartProduction)
    .innerJoin(dbTableProductionOrder, eq(dbTableProductionOrder.id, dbTablePartProduction.productionOrderId))
    .where(eq(dbTableProductionOrder.partId, partId));

  const deliveryNoteLines = await dbConnection
    .select({
      __typename: sql<"DeliveryNoteLine">`'DeliveryNoteLine'`.as("__typename"),
      ...getColumns(dbTableDeliveryNoteLine),
      date: dbTableDeliveryNote.createdAt,
    })
    .from(dbTableDeliveryNoteLine)
    .innerJoin(dbTableDeliveryNote, eq(dbTableDeliveryNote.id, dbTableDeliveryNoteLine.deliveryNoteId))
    .innerJoin(dbTablePartReference, eq(dbTablePartReference.id, dbTableDeliveryNoteLine.partReferenceId))
    .where(eq(dbTablePartReference.partId, partId));

  const stocks = await dbConnection
    .select({
      __typename: sql<"PartStock">`'PartStock'`.as("__typename"),
      ...getColumns(dbTablePartStock),
    })
    .from(dbTablePartStock)
    .where(eq(dbTablePartStock.partId, partId));

  return buildStockLedger(productions, deliveryNoteLines, stocks);
}
