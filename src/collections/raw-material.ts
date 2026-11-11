import { awaitSynced, powerSyncCollection, powerSyncCollectionOptions } from "@/collections/base";
import { rawMaterialSchema } from "@/schemas/raw-material";
import trpc from "@/trpc/trpc-client";

const rawMaterialCollection = powerSyncCollection("raw_material", (baseOptions) =>
  powerSyncCollectionOptions({
    ...baseOptions,
    schema: rawMaterialSchema,
    getKey: (item) => item.id,
    onInsert: async ({ transaction }) => {
      const { modified: newRawMaterial } = transaction.mutations[0];
      await trpc.rawMaterial.create.mutate(newRawMaterial);
      await awaitSynced();
    },
    onUpdate: async ({ transaction }) => {
      const { modified: updatedRawMaterial } = transaction.mutations[0];
      await trpc.rawMaterial.update.mutate(updatedRawMaterial);
      await awaitSynced();
    },
    onDelete: async ({ transaction }) => {
      const { original: deletedRawMaterial } = transaction.mutations[0];
      await trpc.rawMaterial.delete.mutate({
        id: deletedRawMaterial.id,
      });
      await awaitSynced();
    },
  }),
);

export default rawMaterialCollection;
