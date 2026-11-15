import { awaitSynced, powerSyncCollection, powerSyncCollectionOptions } from "@/collections/base";
import { sellOrderSchema } from "@/schemas/sell-order";
import trpc from "@/trpc/trpc-client";

const sellOrderCollection = powerSyncCollection("sell_order", (baseOptions) =>
  powerSyncCollectionOptions({
    ...baseOptions,
    schema: sellOrderSchema,
    getKey: (item) => item.id,
    onInsert: async ({ transaction }) => {
      const { modified: newSellOrder } = transaction.mutations[0];
      await trpc.sellOrder.create.mutate(newSellOrder);
      await awaitSynced();
    },
    onUpdate: async ({ transaction }) => {
      const { modified: updatedSellOrder } = transaction.mutations[0];
      await trpc.sellOrder.update.mutate(updatedSellOrder);
      await awaitSynced();
    },
    onDelete: async ({ transaction }) => {
      const { original: deletedSellOrder } = transaction.mutations[0];
      await trpc.sellOrder.delete.mutate({
        id: deletedSellOrder.id,
      });
      await awaitSynced();
    },
  }),
);

export default sellOrderCollection;
