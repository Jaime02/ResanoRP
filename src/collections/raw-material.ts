import { awaitSynced, powerSyncCollection, powerSyncCollectionOptions } from "@/collections/base";
import { rawMaterialSchema } from "@/schemas/raw-material";
import trpc from "@/trpc/trpc-client";

const rawMaterialCollection = powerSyncCollection("raw_material", (baseOptions) =>
  powerSyncCollectionOptions({
    ...baseOptions,
    schema: rawMaterialSchema,
    getKey: (item) => item.id,
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
