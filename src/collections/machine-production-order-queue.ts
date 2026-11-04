import { electricCollectionOptions } from "@tanstack/electric-db-collection";

import { electricCollection } from "@/collections/base";
import { machineProductionOrderSchema } from "@/schemas/machine-production-order-queue";
import trpc from "@/trpc/trpc-client";

function getMachineProductionOrderKey({
  productionOrderId,
  machineId,
}: {
  productionOrderId: number;
  machineId: number;
}) {
  return `${productionOrderId}-${machineId}`;
}

const machineProductionOrderQueueCollection = electricCollection("machine_production_order_queue", (baseOptions) =>
  electricCollectionOptions({
    ...baseOptions,
    schema: machineProductionOrderSchema,
    getKey: (item) => getMachineProductionOrderKey(item),
    onInsert: async ({ transaction, collection }) => {
      const { modified: newMachineProductionOrder } = transaction.mutations[0];
      const result = await trpc.machineProductionOrderQueue.create.mutate(newMachineProductionOrder);
      await collection.utils.awaitTxId(result.txid);
    },
    onDelete: async ({ transaction, collection }) => {
      const { original: deletedMachineProductionOrder } = transaction.mutations[0];
      const result = await trpc.machineProductionOrderQueue.delete.mutate(deletedMachineProductionOrder);
      await collection.utils.awaitTxId(result.txid);
    },
  }),
);

export default machineProductionOrderQueueCollection;
