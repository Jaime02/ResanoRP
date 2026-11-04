import { electricCollectionOptions } from "@tanstack/electric-db-collection";

import { electricCollection } from "@/collections/base";
import { materialSchema } from "@/schemas/material";
import trpc from "@/trpc/trpc-client";

const materialCollection = electricCollection("material", (baseOptions) =>
  electricCollectionOptions({
    ...baseOptions,
    schema: materialSchema,
    getKey: (item) => item.id,
    onInsert: async ({ transaction, collection }) => {
      const { modified: newMaterial } = transaction.mutations[0];
      const result = await trpc.material.create.mutate(newMaterial);
      await collection.utils.awaitTxId(result.txid);
    },
    onDelete: async ({ transaction, collection }) => {
      const { original: deletedMaterial } = transaction.mutations[0];
      const result = await trpc.material.delete.mutate({
        id: deletedMaterial.id,
      });
      await collection.utils.awaitTxId(result.txid);
    },
  }),
);

export default materialCollection;
