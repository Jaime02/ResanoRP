import { awaitSynced, powerSyncCollection, powerSyncCollectionOptions } from "@/collections/base";
import { productionOrderSchema } from "@/schemas/production-order";
import trpc from "@/trpc/trpc-client";

const productionOrderCollection = powerSyncCollection("production_order", (baseOptions) =>
  powerSyncCollectionOptions({
    ...baseOptions,
    schema: productionOrderSchema,
    getKey: (item) => item.id,
    onInsert: async ({ transaction }) => {
      const { modified: newProductionOrder } = transaction.mutations[0];
      await trpc.productionOrder.create.mutate(newProductionOrder);
      await awaitSynced();
    },
    onUpdate: async ({ transaction }) => {
      const { modified: updatedProductionOrder } = transaction.mutations[0];
      await trpc.productionOrder.update.mutate(updatedProductionOrder);
      await awaitSynced();
    },
    onDelete: async ({ transaction }) => {
      const { original: deletedProductionOrder } = transaction.mutations[0];
      await trpc.productionOrder.delete.mutate({
        id: deletedProductionOrder.id,
      });
      await awaitSynced();
    },
  }),
);

export default productionOrderCollection;
