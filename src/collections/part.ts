import { awaitSynced, powerSyncCollection, powerSyncCollectionOptions } from "@/collections/base";
import { partSchema } from "@/schemas/part";
import trpc from "@/trpc/trpc-client";

const partCollection = powerSyncCollection("part", (baseOptions) =>
  powerSyncCollectionOptions({
    ...baseOptions,
    schema: partSchema,
    getKey: (item) => item.id,
    onUpdate: async ({ transaction }) => {
      const { modified: updatedPart } = transaction.mutations[0];
      await trpc.part.update.mutate(updatedPart);
      await awaitSynced();
    },
    onDelete: async ({ transaction }) => {
      const { original: deletedPart } = transaction.mutations[0];
      await trpc.part.delete.mutate({
        id: deletedPart.id,
      });
      await awaitSynced();
    },
  }),
);

export default partCollection;
