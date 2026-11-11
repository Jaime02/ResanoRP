import { inArray } from "drizzle-orm";

import type { TDatabase } from "@/db";
import db from "@/db";
import { dbTableMachine, dbTableMachineProductionOrderQueue } from "@/db/schema";

export async function getMachineProductionOrderQueue(machineId: number, dbConnection: TDatabase = db) {
  const productionOrders = await dbConnection.query.dbTableMachineProductionOrderQueue.findMany({
    orderBy: { timestamp: "desc" },
    where: { machineId },
    with: {
      productionOrder: true,
    },
  });
  return productionOrders.map((mpo) => mpo.productionOrder);
}

export async function removeProductionOrdersFromMachines(
  productionOrderIds: Array<number>,
  dbConnection: TDatabase = db,
): Promise<void> {
  if (productionOrderIds.length === 0) {
    return;
  }

  await dbConnection
    .delete(dbTableMachineProductionOrderQueue)
    .where(inArray(dbTableMachineProductionOrderQueue.productionOrderId, productionOrderIds));

  await dbConnection
    .update(dbTableMachine)
    .set({ activeProductionOrderId: null })
    .where(inArray(dbTableMachine.activeProductionOrderId, productionOrderIds));
}
