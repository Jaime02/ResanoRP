import { electricCollectionOptions } from "@tanstack/electric-db-collection";

import { electricCollection } from "@/collections/base";
import partCollection from "@/collections/part";
import { coatingSchema } from "@/schemas/coating";
import trpc from "@/trpc/trpc-client";

const coatingCollection = electricCollection("coating", (baseOptions, dbClient) =>
  electricCollectionOptions({
    ...baseOptions,
    schema: coatingSchema,
    getKey: (item) => item.id,
    onInsert: async ({ transaction, collection }) => {
      const { modified: newCoating } = transaction.mutations[0];
      const result = await trpc.coating.create.mutate(newCoating);
      await collection.utils.awaitTxId(result.txid);
    },
    onUpdate: async ({ transaction, collection }) => {
      const { modified: updatedCoating } = transaction.mutations[0];
      const result = await trpc.coating.update.mutate(updatedCoating);
      await collection.utils.awaitTxId(result.txid);
    },
    onDelete: async ({ transaction, collection }) => {
      const { original: deletedCoating } = transaction.mutations[0];
      const result = await trpc.coating.delete.mutate({
        id: deletedCoating.id,
      });
      // Awaiting a collection the delete did not write times out
      await Promise.all([
        collection.utils.awaitTxId(result.txid),
        ...(result.updatedPartIds.length > 0 ? [dbClient.collection(partCollection).utils.awaitTxId(result.txid)] : []),
      ]);
    },
  }),
);

export default coatingCollection;
