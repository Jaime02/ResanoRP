import { electricCollectionOptions } from "@tanstack/electric-db-collection";

import { electricCollection } from "@/collections/base";
import { collectionBlueprintSchema } from "@/schemas/blueprint";
import trpc from "@/trpc/trpc-client";

const blueprintCollection = electricCollection("blueprint", (baseOptions) => {
  const { sync, ...options } = electricCollectionOptions({
    ...baseOptions,
    syncMode: "on-demand",
    schema: collectionBlueprintSchema,
    getKey: (item) => item.id,
    onInsert: async ({ transaction, collection }) => {
      const { modified: newBlueprint } = transaction.mutations[0];
      const result = await trpc.blueprint.create.mutate(newBlueprint);
      await collection.utils.awaitTxId(result.txid);
    },
    onUpdate: async ({ transaction, collection }) => {
      const { modified: updatedBlueprint } = transaction.mutations[0];
      const result = await trpc.blueprint.update.mutate(updatedBlueprint);
      await collection.utils.awaitTxId(result.txid);
    },
    onDelete: async ({ transaction, collection }) => {
      const { original: deletedBlueprint } = transaction.mutations[0];
      const result = await trpc.blueprint.delete.mutate({
        id: deletedBlueprint.id,
      });
      await collection.utils.awaitTxId(result.txid);
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
