import { awaitSynced, powerSyncCollection, powerSyncCollectionOptions } from "@/collections/base";
import { materialSchema } from "@/schemas/material";
import trpc from "@/trpc/trpc-client";

const materialCollection = powerSyncCollection("material", (baseOptions) =>
  powerSyncCollectionOptions({
    ...baseOptions,
    schema: materialSchema,
    getKey: (item) => item.id,
    onInsert: async ({ transaction }) => {
      const { modified: newMaterial } = transaction.mutations[0];
      await trpc.material.create.mutate(newMaterial);
      await awaitSynced();
    },
    onDelete: async ({ transaction }) => {
      const { original: deletedMaterial } = transaction.mutations[0];
      await trpc.material.delete.mutate({
        id: deletedMaterial.id,
      });
      await awaitSynced();
    },
  }),
);

export default materialCollection;
