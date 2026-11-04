import { electricCollectionOptions } from "@tanstack/electric-db-collection";

import { electricCollection } from "@/collections/base";
import clientCollection from "@/collections/client";
import { paymentMethodSchema } from "@/schemas/payment-method";
import trpc from "@/trpc/trpc-client";

const paymentMethodCollection = electricCollection("payment_method", (baseOptions, dbClient) =>
  electricCollectionOptions({
    ...baseOptions,
    schema: paymentMethodSchema,
    getKey: (item) => item.id,
    onInsert: async ({ transaction, collection }) => {
      const { modified: newPaymentMethod } = transaction.mutations[0];
      const result = await trpc.paymentMethod.create.mutate(newPaymentMethod);
      await collection.utils.awaitTxId(result.txid);
    },
    onUpdate: async ({ transaction, collection }) => {
      const { modified: updatedPaymentMethod } = transaction.mutations[0];
      const result = await trpc.paymentMethod.update.mutate(updatedPaymentMethod);
      await collection.utils.awaitTxId(result.txid);
    },
    onDelete: async ({ transaction, collection }) => {
      const { original: deletedPaymentMethod } = transaction.mutations[0];
      const result = await trpc.paymentMethod.delete.mutate({
        id: deletedPaymentMethod.id,
      });
      // Awaiting a collection the delete did not write times out
      await Promise.all([
        collection.utils.awaitTxId(result.txid),
        ...(result.updatedClientIds.length > 0
          ? [dbClient.collection(clientCollection).utils.awaitTxId(result.txid)]
          : []),
      ]);
    },
  }),
);

export default paymentMethodCollection;
