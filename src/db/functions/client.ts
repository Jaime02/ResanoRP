import type { TDatabase } from "@/db";
import db from "@/db";

export function getClientById(id: number, dbConnection: TDatabase = db) {
  return dbConnection.query.dbTableClient.findFirst({
    where: { id },
  });
}
