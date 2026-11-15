import { awaitSynced, powerSyncCollection, powerSyncCollectionOptions } from "@/collections/base";
import { collectionBlueprintSchema } from "@/schemas/blueprint";
import trpc from "@/trpc/trpc-client";

const blueprintCollection = powerSyncCollection("blueprint", (baseOptions) => {
  const { sync, ...options } = powerSyncCollectionOptions({
    ...baseOptions,
    schema: collectionBlueprintSchema,
    getKey: (item) => item.id,
    onInsert: async ({ transaction }) => {
      const { modified: newBlueprint } = transaction.mutations[0];
      await trpc.blueprint.create.mutate(newBlueprint);
      await awaitSynced();
    },
    onUpdate: async ({ transaction }) => {
      const { modified: updatedBlueprint } = transaction.mutations[0];
      await trpc.blueprint.update.mutate(updatedBlueprint);
      await awaitSynced();
    },
    onDelete: async ({ transaction }) => {
      const { original: deletedBlueprint } = transaction.mutations[0];
      await trpc.blueprint.delete.mutate({
        id: deletedBlueprint.id,
      });
      await awaitSynced();
    },
  });

  return {
    ...options,
    sync: {
      ...sync,
      sync: (params: Parameters<typeof sync.sync>[0]) =>
        sync.sync({
          ...params,
          write: (message) =>
            params.write(
              `value` in message
                ? { ...message, value: { ...message.value, fileUrl: `/api/files/blueprint/${message.value.id}` } }
                : message,
            ),
        }),
    },
  };
});

export default blueprintCollection;
