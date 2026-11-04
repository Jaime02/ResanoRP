import { electricCollectionOptions } from "@tanstack/electric-db-collection";

import { electricCollection } from "@/collections/base";
import { rawMaterialSchema } from "@/schemas/raw-material";
import trpc from "@/trpc/trpc-client";

const rawMaterialCollection = electricCollection("raw_material", (baseOptions) =>
  electricCollectionOptions({
    ...baseOptions,
    schema: rawMaterialSchema,
    getKey: (item) => item.id,
    onInsert: async ({ transaction, collection }) => {
      const { modified: newRawMaterial } = transaction.mutations[0];
      const result = await trpc.rawMaterial.create.mutate(newRawMaterial);
      await collection.utils.awaitTxId(result.txid);
    },
    onUpdate: async ({ transaction, collection }) => {
      const { modified: updatedRawMaterial } = transaction.mutations[0];
      const result = await trpc.rawMaterial.update.mutate(updatedRawMaterial);
      await collection.utils.awaitTxId(result.txid);
    },
    onDelete: async ({ transaction, collection }) => {
      const { original: deletedRawMaterial } = transaction.mutations[0];
      const result = await trpc.rawMaterial.delete.mutate({
        id: deletedRawMaterial.id,
      });
      await collection.utils.awaitTxId(result.txid);
    },
  }),
);

export default rawMaterialCollection;
