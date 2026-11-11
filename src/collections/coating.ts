import { awaitSynced, powerSyncCollection, powerSyncCollectionOptions } from "@/collections/base";
import { coatingSchema } from "@/schemas/coating";
import trpc from "@/trpc/trpc-client";

const coatingCollection = powerSyncCollection("coating", (baseOptions) =>
  powerSyncCollectionOptions({
    ...baseOptions,
    schema: coatingSchema,
    getKey: (item) => item.id,
    onInsert: async ({ transaction }) => {
      const { modified: newCoating } = transaction.mutations[0];
      await trpc.coating.create.mutate(newCoating);
      await awaitSynced();
    },
    onUpdate: async ({ transaction }) => {
      const { modified: updatedCoating } = transaction.mutations[0];
      await trpc.coating.update.mutate(updatedCoating);
      await awaitSynced();
    },
    onDelete: async ({ transaction }) => {
      const { original: deletedCoating } = transaction.mutations[0];
      await trpc.coating.delete.mutate({
        id: deletedCoating.id,
      });
      await awaitSynced();
    },
  }),
);

export default coatingCollection;
