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

interface TRemoveProductionOrdersFromMachinesResult {
  /** Only true when a queue row was actually deleted, so callers can await its collection. */
  removedFromQueue: boolean;
  /** Machines whose active Production Order was cleared, so callers can await their collection. */
  stoppedMachineIds: Array<number>;
}

export async function removeProductionOrdersFromMachines(
  productionOrderIds: Array<number>,
  dbConnection: TDatabase = db,
): Promise<TRemoveProductionOrdersFromMachinesResult> {
  if (productionOrderIds.length === 0) {
    return { removedFromQueue: false, stoppedMachineIds: [] };
  }

  const removedQueueRows = await dbConnection
    .delete(dbTableMachineProductionOrderQueue)
    .where(inArray(dbTableMachineProductionOrderQueue.productionOrderId, productionOrderIds))
    .returning();

  const stoppedMachines = await dbConnection
    .update(dbTableMachine)
    .set({ activeProductionOrderId: null })
    .where(inArray(dbTableMachine.activeProductionOrderId, productionOrderIds))
    .returning({ id: dbTableMachine.id });

  return {
    removedFromQueue: removedQueueRows.length > 0,
    stoppedMachineIds: stoppedMachines.map((machine) => machine.id),
  };
}
