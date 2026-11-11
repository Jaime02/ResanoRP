import { awaitSynced, powerSyncCollection, powerSyncCollectionOptions } from "@/collections/base";
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

const machineProductionOrderQueueCollection = powerSyncCollection("machine_production_order_queue", (baseOptions) =>
  powerSyncCollectionOptions({
    ...baseOptions,
    schema: machineProductionOrderSchema,
    getKey: (item) => getMachineProductionOrderKey(item),
    onInsert: async ({ transaction }) => {
      const { modified: newMachineProductionOrder } = transaction.mutations[0];
      await trpc.machineProductionOrderQueue.create.mutate(newMachineProductionOrder);
      await awaitSynced();
    },
    onDelete: async ({ transaction }) => {
      const { original: deletedMachineProductionOrder } = transaction.mutations[0];
      await trpc.machineProductionOrderQueue.delete.mutate(deletedMachineProductionOrder);
      await awaitSynced();
    },
  }),
);

export default machineProductionOrderQueueCollection;
