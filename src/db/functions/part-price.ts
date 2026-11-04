import type { TDatabase } from "@/db";
import db from "@/db";

export function getPartPriceById(partPriceId: number, dbConnection: TDatabase = db) {
  return dbConnection.query.dbTablePartPrice.findFirst({ where: { id: partPriceId } });
}

export function getPartPricesByPartId(partId: number, dbConnection: TDatabase = db) {
  return dbConnection.query.dbTablePartPrice.findMany({ where: { partId } });
}
