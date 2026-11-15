import { awaitSynced, powerSyncCollection, powerSyncCollectionOptions } from "@/collections/base";
import { partReferenceSchema } from "@/schemas/part-reference";
import trpc from "@/trpc/trpc-client";

const partReferenceCollection = powerSyncCollection("part_reference", (baseOptions) =>
  powerSyncCollectionOptions({
    ...baseOptions,
    schema: partReferenceSchema,
    getKey: (item) => item.id,
    onInsert: async ({ transaction }) => {
      const { modified: newPartReference } = transaction.mutations[0];
      await trpc.partReference.create.mutate(newPartReference);
      await awaitSynced();
    },
    onUpdate: async ({ transaction }) => {
      const { modified: updatedPartReference } = transaction.mutations[0];
      await trpc.partReference.update.mutate(updatedPartReference);
      await awaitSynced();
    },
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
