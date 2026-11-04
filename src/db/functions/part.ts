import type { TDatabase } from "@/db";
import db from "@/db";

export function getPartById(partId: number, dbConnection: TDatabase = db) {
  return dbConnection.query.dbTablePart.findFirst({ where: { id: partId } });
}

export function getPartFeaturesOfPart(partId: number, dbConnection: TDatabase = db) {
  return dbConnection.query.dbTablePartFeature.findMany({ where: { partId }, orderBy: { id: "asc" } });
}
