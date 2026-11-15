import { awaitSynced, powerSyncCollection, powerSyncCollectionOptions } from "@/collections/base";
import { paymentMethodSchema } from "@/schemas/payment-method";
import trpc from "@/trpc/trpc-client";

const paymentMethodCollection = powerSyncCollection("payment_method", (baseOptions) =>
  powerSyncCollectionOptions({
    ...baseOptions,
    schema: paymentMethodSchema,
    getKey: (item) => item.id,
    onInsert: async ({ transaction }) => {
      const { modified: newPaymentMethod } = transaction.mutations[0];
      await trpc.paymentMethod.create.mutate(newPaymentMethod);
      await awaitSynced();
    },
    onUpdate: async ({ transaction }) => {
      const { modified: updatedPaymentMethod } = transaction.mutations[0];
      await trpc.paymentMethod.update.mutate(updatedPaymentMethod);
      await awaitSynced();
    },
    onDelete: async ({ transaction }) => {
      const { original: deletedPaymentMethod } = transaction.mutations[0];
      await trpc.paymentMethod.delete.mutate({
        id: deletedPaymentMethod.id,
      });
      await awaitSynced();
    },
  }),
);

export default paymentMethodCollection;
