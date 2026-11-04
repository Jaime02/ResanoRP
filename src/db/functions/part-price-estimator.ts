import type { TDatabase } from "@/db";
import db from "@/db";

export function getPartPriceEstimatorByPartId(partId: number, dbConnection: TDatabase = db) {
  return dbConnection.query.dbTablePartPriceEstimator.findFirst({
    where: { partId },
  });
}
