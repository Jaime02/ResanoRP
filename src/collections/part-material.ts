import { awaitSynced, powerSyncCollection, powerSyncCollectionOptions } from "@/collections/base";
import { partMaterialSchema } from "@/schemas/part-material";
import trpc from "@/trpc/trpc-client";

export function getPartMaterialKey({ partId, materialId }: { partId: number; materialId: number }) {
  return `${partId}-${materialId}`;
}

const partMaterialCollection = powerSyncCollection("part_material", (baseOptions) =>
  powerSyncCollectionOptions({
    ...baseOptions,
    schema: partMaterialSchema,
    getKey: (item) => getPartMaterialKey({ partId: item.partId, materialId: item.materialId }),
    onInsert: async ({ transaction }) => {
      const { modified: newPartMaterial } = transaction.mutations[0];
      await trpc.partMaterial.addMaterialToPart.mutate(newPartMaterial);
      await awaitSynced();
    },
    onDelete: async ({ transaction }) => {
      const { original: deletedPartMaterial } = transaction.mutations[0];
      await trpc.partMaterial.deleteMaterialFromPart.mutate(deletedPartMaterial);
      await awaitSynced();
    },
  }),
);

export default partMaterialCollection;
