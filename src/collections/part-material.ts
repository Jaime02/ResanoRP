import { electricCollectionOptions } from "@tanstack/electric-db-collection";

import { electricCollection } from "@/collections/base";
import { partMaterialSchema } from "@/schemas/part-material";
import trpc from "@/trpc/trpc-client";

export function getPartMaterialKey({ partId, materialId }: { partId: number; materialId: number }) {
  return `${partId}-${materialId}`;
}

const partMaterialCollection = electricCollection("part_material", (baseOptions) =>
  electricCollectionOptions({
    ...baseOptions,
    syncMode: "on-demand",
    schema: partMaterialSchema,
    getKey: (item) => getPartMaterialKey({ partId: item.partId, materialId: item.materialId }),
    onInsert: async ({ transaction, collection }) => {
      const { modified: newPartMaterial } = transaction.mutations[0];
      const result = await trpc.partMaterial.addMaterialToPart.mutate(newPartMaterial);
      await collection.utils.awaitTxId(result.txid);
    },
    onDelete: async ({ transaction, collection }) => {
      const { original: deletedPartMaterial } = transaction.mutations[0];
      const result = await trpc.partMaterial.deleteMaterialFromPart.mutate(deletedPartMaterial);
      await collection.utils.awaitTxId(result.txid);
    },
  }),
);

export default partMaterialCollection;
