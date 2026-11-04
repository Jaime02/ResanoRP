import { electricCollectionOptions } from "@tanstack/electric-db-collection";

import { electricCollection } from "@/collections/base";
import blueprintCollection from "@/collections/blueprint";
import { partSchema } from "@/schemas/part";
import trpc from "@/trpc/trpc-client";

const partCollection = electricCollection("part", (baseOptions, dbClient) =>
  electricCollectionOptions({
    ...baseOptions,
    syncMode: "on-demand",
    schema: partSchema,
    getKey: (item) => item.id,
    onUpdate: async ({ transaction, collection }) => {
      const { modified: updatedPart } = transaction.mutations[0];
      const result = await trpc.part.update.mutate(updatedPart);
      await collection.utils.awaitTxId(result.txid);
    },
    onDelete: async ({ transaction, collection }) => {
      const { original: deletedPart } = transaction.mutations[0];
      const result = await trpc.part.delete.mutate({
        id: deletedPart.id,
      });
      // Awaiting a collection the delete did not write times out
      await Promise.all([
        collection.utils.awaitTxId(result.txid),
        ...(result.deletedBlueprintIds.length > 0
          ? [dbClient.collection(blueprintCollection).utils.awaitTxId(result.txid)]
          : []),
      ]);
    },
  }),
);

export default partCollection;
