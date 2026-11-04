import { electricCollectionOptions } from "@tanstack/electric-db-collection";

import { electricCollection } from "@/collections/base";
import { partReferenceSchema } from "@/schemas/part-reference";
import trpc from "@/trpc/trpc-client";

const partReferenceCollection = electricCollection("part_reference", (baseOptions) =>
  electricCollectionOptions({
    ...baseOptions,
    syncMode: "on-demand",
    schema: partReferenceSchema,
    getKey: (item) => item.id,
    onInsert: async ({ transaction, collection }) => {
      const { modified: newPartReference } = transaction.mutations[0];
      const result = await trpc.partReference.create.mutate(newPartReference);
      await collection.utils.awaitTxId(result.txid);
    },
    onUpdate: async ({ transaction, collection }) => {
      const { modified: updatedPartReference } = transaction.mutations[0];
      const result = await trpc.partReference.update.mutate(updatedPartReference);
      await collection.utils.awaitTxId(result.txid);
    },
    onDelete: async ({ transaction, collection }) => {
      const { original: deletedPartReference } = transaction.mutations[0];
      const result = await trpc.partReference.delete.mutate({
        id: deletedPartReference.id,
      });
      await collection.utils.awaitTxId(result.txid);
    },
  }),
);

export default partReferenceCollection;
