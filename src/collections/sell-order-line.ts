import { createOptimisticAction } from "@tanstack/react-db";
import type { DbClient } from "@tanstack/react-db";

import { awaitSynced, powerSyncCollection, powerSyncCollectionOptions } from "@/collections/base";
import { sellOrderLineSchema } from "@/schemas/sell-order-line";
import type { TCreateSellOrderLine } from "@/schemas/sell-order-line";
import trpc from "@/trpc/trpc-client";

const sellOrderLineCollection = powerSyncCollection("sell_order_line", (baseOptions) =>
  powerSyncCollectionOptions({
    ...baseOptions,
    schema: sellOrderLineSchema,
    getKey: (item) => item.id,
    onInsert: async ({ transaction }) => {
      const { modified: newSellOrderLine } = transaction.mutations[0];
      await trpc.sellOrderLine.create.mutate(newSellOrderLine as TCreateSellOrderLine);
      await awaitSynced();
    },
    onUpdate: async ({ transaction }) => {
      const { modified: updatedSellOrderLine } = transaction.mutations[0];
      await trpc.sellOrderLine.update.mutate(updatedSellOrderLine);
      await awaitSynced();
    },
    onDelete: async ({ transaction }) => {
      const { original: deletedSellOrderLine } = transaction.mutations[0];
      await trpc.sellOrderLine.delete.mutate({
        id: deletedSellOrderLine.id,
      });
      await awaitSynced();
    },
  }),
);

export const restoreSellOrderLine = createOptimisticAction({
  onMutate: ({ dbClient, sellOrderLineId }: { dbClient: DbClient; sellOrderLineId: number }) => {
    dbClient.collection(sellOrderLineCollection).update(sellOrderLineId, (draft) => {
      draft.deletedAt = null;
    });
  },
  mutationFn: async ({ sellOrderLineId }) => {
    await trpc.sellOrderLine.restore.mutate({ id: sellOrderLineId });
    await awaitSynced();
  },
});

export default sellOrderLineCollection;
