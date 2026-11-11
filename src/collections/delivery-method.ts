import { awaitSynced, powerSyncCollection, powerSyncCollectionOptions } from "@/collections/base";
import { deliveryMethodSchema } from "@/schemas/delivery-method";
import trpc from "@/trpc/trpc-client";

const deliveryMethodCollection = powerSyncCollection("delivery_method", (baseOptions) =>
  powerSyncCollectionOptions({
    ...baseOptions,
    schema: deliveryMethodSchema,
    getKey: (item) => item.id,
    onInsert: async ({ transaction }) => {
      const { modified: newDeliveryMethod } = transaction.mutations[0];
      await trpc.deliveryMethod.create.mutate(newDeliveryMethod);
      await awaitSynced();
    },
    onUpdate: async ({ transaction }) => {
      const { modified: updatedDeliveryMethod } = transaction.mutations[0];
      await trpc.deliveryMethod.update.mutate(updatedDeliveryMethod);
      await awaitSynced();
    },
    onDelete: async ({ transaction }) => {
      const { original: deletedDeliveryMethod } = transaction.mutations[0];
      await trpc.deliveryMethod.delete.mutate({
        id: deletedDeliveryMethod.id,
      });
      await awaitSynced();
    },
  }),
);

export default deliveryMethodCollection;
