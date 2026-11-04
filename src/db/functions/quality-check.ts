import type { TDatabase } from "@/db";
import db from "@/db";

export function getQualityChecksOfProductionOrder(productionOrderId: number, dbConnection: TDatabase = db) {
  return dbConnection.query.dbTableQualityCheck.findMany({
    where: { productionOrderId },
    orderBy: { checkedAt: "asc", id: "asc" },
  });
}
