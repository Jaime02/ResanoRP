import { electricCollectionOptions } from "@tanstack/electric-db-collection";
import { createOptimisticAction } from "@tanstack/react-db";
import type { DbClient } from "@tanstack/react-db";

import { electricCollection } from "@/collections/base";
import invoiceCollection from "@/collections/invoice";
import machineCollection from "@/collections/machine";
import machineProductionOrderQueueCollection from "@/collections/machine-production-order-queue";
import { sellOrderLineSchema } from "@/schemas/sell-order-line";
import type { TCreateSellOrderLine } from "@/schemas/sell-order-line";
import trpc from "@/trpc/trpc-client";

const sellOrderLineCollection = electricCollection("sell_order_line", (baseOptions, dbClient) =>
  electricCollectionOptions({
    ...baseOptions,
    syncMode: "on-demand",
    schema: sellOrderLineSchema,
    getKey: (item) => item.id,
    onInsert: async ({ transaction, collection }) => {
      const { modified: newSellOrderLine } = transaction.mutations[0];
      const result = await trpc.sellOrderLine.create.mutate(newSellOrderLine as TCreateSellOrderLine);
      await collection.utils.awaitTxId(result.txid);
    },
    onUpdate: async ({ transaction, collection }) => {
      const { modified: updatedSellOrderLine } = transaction.mutations[0];
      const result = await trpc.sellOrderLine.update.mutate(updatedSellOrderLine);
      await Promise.all([
        collection.utils.awaitTxId(result.txid),
        // Awaiting a collection the update did not write times out
        ...(result.resetInvoiceIds.length > 0
          ? [dbClient.collection(invoiceCollection).utils.awaitTxId(result.txid)]
          : []),
      ]);
    },
    onDelete: async ({ transaction, collection }) => {
      const { original: deletedSellOrderLine } = transaction.mutations[0];
      const result = await trpc.sellOrderLine.delete.mutate({
        id: deletedSellOrderLine.id,
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

export const restoreSellOrderLine = createOptimisticAction({
  onMutate: ({ dbClient, sellOrderLineId }: { dbClient: DbClient; sellOrderLineId: number }) => {
    dbClient.collection(sellOrderLineCollection).update(sellOrderLineId, (draft) => {
      draft.deletedAt = null;
    });
  },
  mutationFn: async ({ dbClient, sellOrderLineId }) => {
    const { txid } = await trpc.sellOrderLine.restore.mutate({ id: sellOrderLineId });
    await dbClient.collection(sellOrderLineCollection).utils.awaitTxId(txid);
  },
});

export default sellOrderLineCollection;
