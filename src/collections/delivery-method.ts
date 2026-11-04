import { electricCollectionOptions } from "@tanstack/electric-db-collection";

import { electricCollection } from "@/collections/base";
import clientCollection from "@/collections/client";
import { deliveryMethodSchema } from "@/schemas/delivery-method";
import trpc from "@/trpc/trpc-client";

const deliveryMethodCollection = electricCollection("delivery_method", (baseOptions, dbClient) =>
  electricCollectionOptions({
    ...baseOptions,
    schema: deliveryMethodSchema,
    getKey: (item) => item.id,
    onInsert: async ({ transaction, collection }) => {
      const { modified: newDeliveryMethod } = transaction.mutations[0];
      const result = await trpc.deliveryMethod.create.mutate(newDeliveryMethod);
      await collection.utils.awaitTxId(result.txid);
    },
    onUpdate: async ({ transaction, collection }) => {
      const { modified: updatedDeliveryMethod } = transaction.mutations[0];
      const result = await trpc.deliveryMethod.update.mutate(updatedDeliveryMethod);
      await collection.utils.awaitTxId(result.txid);
    },
    onDelete: async ({ transaction, collection }) => {
      const { original: deletedDeliveryMethod } = transaction.mutations[0];
      const result = await trpc.deliveryMethod.delete.mutate({
        id: deletedDeliveryMethod.id,
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

export default deliveryMethodCollection;
