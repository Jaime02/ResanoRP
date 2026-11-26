import { awaitSynced, powerSyncCollection, powerSyncCollectionOptions } from "@/collections/base";
import { materialLotSchema } from "@/schemas/material-lot";
import trpc from "@/trpc/trpc-client";

const materialLotCollection = powerSyncCollection("material_lot", (baseOptions) =>
  powerSyncCollectionOptions({
    ...baseOptions,
    schema: materialLotSchema,
    getKey: (item) => item.id,
    onDelete: async ({ transaction }) => {
      const { original: deletedMaterialLot } = transaction.mutations[0];
      await trpc.materialLot.delete.mutate({ id: deletedMaterialLot.id });
      await awaitSynced();
    },
  }),
);

export default materialLotCollection;
