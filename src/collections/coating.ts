import { awaitSynced, powerSyncCollection, powerSyncCollectionOptions } from "@/collections/base";
import { coatingSchema } from "@/schemas/coating";
import trpc from "@/trpc/trpc-client";

const coatingCollection = powerSyncCollection("coating", (baseOptions) =>
  powerSyncCollectionOptions({
    ...baseOptions,
    schema: coatingSchema,
    getKey: (item) => item.id,
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
