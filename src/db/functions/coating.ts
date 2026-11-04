import type { TDatabase } from "@/db";
import db from "@/db";

export function getCoatingById(coatingId: number, dbConnection: TDatabase = db) {
  return dbConnection.query.dbTableCoating.findFirst({
    where: { id: coatingId },
  });
}
