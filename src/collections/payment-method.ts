import { awaitSynced, powerSyncCollection, powerSyncCollectionOptions } from "@/collections/base";
import { paymentMethodSchema } from "@/schemas/payment-method";
import trpc from "@/trpc/trpc-client";

const paymentMethodCollection = powerSyncCollection("payment_method", (baseOptions) =>
  powerSyncCollectionOptions({
    ...baseOptions,
    schema: paymentMethodSchema,
    getKey: (item) => item.id,
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
