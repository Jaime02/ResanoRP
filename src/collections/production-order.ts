import { electricCollectionOptions } from "@tanstack/electric-db-collection";

import { electricCollection } from "@/collections/base";
import machineCollection from "@/collections/machine";
import machineProductionOrderQueueCollection from "@/collections/machine-production-order-queue";
import { productionOrderSchema } from "@/schemas/production-order";
import trpc from "@/trpc/trpc-client";

const productionOrderCollection = electricCollection("production_order", (baseOptions, dbClient) =>
  electricCollectionOptions({
    ...baseOptions,
    syncMode: "on-demand",
    schema: productionOrderSchema,
    getKey: (item) => item.id,
    onInsert: async ({ transaction, collection }) => {
      const { modified: newProductionOrder } = transaction.mutations[0];
      const result = await trpc.productionOrder.create.mutate(newProductionOrder);
      await collection.utils.awaitTxId(result.txid);
    },
    onUpdate: async ({ transaction, collection }) => {
      const { modified: updatedProductionOrder } = transaction.mutations[0];
      const result = await trpc.productionOrder.update.mutate(updatedProductionOrder);
      await collection.utils.awaitTxId(result.txid);
    },
    onDelete: async ({ transaction, collection }) => {
      const { original: deletedProductionOrder } = transaction.mutations[0];
      const result = await trpc.productionOrder.delete.mutate({
        id: deletedProductionOrder.id,
      });
      // Awaiting a collection the delete did not write times out
      await Promise.all([
        collection.utils.awaitTxId(result.txid),
        ...(result.removedFromQueue
          ? [dbClient.collection(machineProductionOrderQueueCollection).utils.awaitTxId(result.txid)]
          : []),
        ...(result.stoppedMachineIds.length > 0
          ? [dbClient.collection(machineCollection).utils.awaitTxId(result.txid)]
          : []),
      ]);
    },
  }),
);

export default productionOrderCollection;
