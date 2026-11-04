import { electricCollectionOptions } from "@tanstack/electric-db-collection";

import { electricCollection } from "@/collections/base";
import machineCollection from "@/collections/machine";
import machineProductionOrderQueueCollection from "@/collections/machine-production-order-queue";
import { sellOrderSchema } from "@/schemas/sell-order";
import trpc from "@/trpc/trpc-client";

const sellOrderCollection = electricCollection("sell_order", (baseOptions, dbClient) =>
  electricCollectionOptions({
    ...baseOptions,
    syncMode: "on-demand",
    schema: sellOrderSchema,
    getKey: (item) => item.id,
    onInsert: async ({ transaction, collection }) => {
      const { modified: newSellOrder } = transaction.mutations[0];
      const result = await trpc.sellOrder.create.mutate(newSellOrder);
      await collection.utils.awaitTxId(result.txid);
    },
    onUpdate: async ({ transaction, collection }) => {
      const { modified: updatedSellOrder } = transaction.mutations[0];
      const result = await trpc.sellOrder.update.mutate(updatedSellOrder);
      await collection.utils.awaitTxId(result.txid);
    },
    onDelete: async ({ transaction, collection }) => {
      const { original: deletedSellOrder } = transaction.mutations[0];
      const result = await trpc.sellOrder.delete.mutate({
        id: deletedSellOrder.id,
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

export default sellOrderCollection;
