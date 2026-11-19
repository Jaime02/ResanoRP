import { awaitSynced, powerSyncCollection, powerSyncCollectionOptions } from "@/collections/base";
import { partFeatureSchema } from "@/schemas/part-feature";
import trpc from "@/trpc/trpc-client";

const partFeatureCollection = powerSyncCollection("part_feature", (baseOptions) =>
  powerSyncCollectionOptions({
    ...baseOptions,
    schema: partFeatureSchema,
    getKey: (item) => item.id,
    onUpdate: async ({ transaction }) => {
      const { original, changes } = transaction.mutations[0];
      await trpc.partFeature.update.mutate({ ...changes, id: original.id });
      await awaitSynced();
    },
    onDelete: async ({ transaction }) => {
      const { original: deletedPartFeature } = transaction.mutations[0];
      await trpc.partFeature.delete.mutate({
        id: deletedPartFeature.id,
      });
      await awaitSynced();
    },
  }),
);

export default partFeatureCollection;
