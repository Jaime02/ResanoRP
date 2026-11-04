import { electricCollectionOptions } from "@tanstack/electric-db-collection";

import { electricCollection } from "@/collections/base";
import { partFeatureSchema } from "@/schemas/part-feature";
import trpc from "@/trpc/trpc-client";

const partFeatureCollection = electricCollection("part_feature", (baseOptions) =>
  electricCollectionOptions({
    ...baseOptions,
    syncMode: "on-demand",
    schema: partFeatureSchema,
    getKey: (item) => item.id,
    onInsert: async ({ transaction, collection }) => {
      const { modified: newPartFeature } = transaction.mutations[0];
      const result = await trpc.partFeature.create.mutate(newPartFeature);
      await collection.utils.awaitTxId(result.txid);
    },
    onUpdate: async ({ transaction, collection }) => {
      const { modified: updatedPartFeature } = transaction.mutations[0];
      const result = await trpc.partFeature.update.mutate(updatedPartFeature);
      await collection.utils.awaitTxId(result.txid);
    },
    onDelete: async ({ transaction, collection }) => {
      const { original: deletedPartFeature } = transaction.mutations[0];
      const result = await trpc.partFeature.delete.mutate({
        id: deletedPartFeature.id,
      });
      await collection.utils.awaitTxId(result.txid);
    },
  }),
);

export default partFeatureCollection;
