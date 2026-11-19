import { awaitSynced, powerSyncCollection, powerSyncCollectionOptions } from "@/collections/base";
import { partReferenceSchema } from "@/schemas/part-reference";
import trpc from "@/trpc/trpc-client";

const partReferenceCollection = powerSyncCollection("part_reference", (baseOptions) =>
  powerSyncCollectionOptions({
    ...baseOptions,
    schema: partReferenceSchema,
    getKey: (item) => item.id,
    onDelete: async ({ transaction }) => {
      const { original: deletedPartReference } = transaction.mutations[0];
      await trpc.partReference.delete.mutate({
        id: deletedPartReference.id,
      });
      await awaitSynced();
    },
  }),
);

export default partReferenceCollection;
