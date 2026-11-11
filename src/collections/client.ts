import { awaitSynced, powerSyncCollection, powerSyncCollectionOptions } from "@/collections/base";
import { clientSchema } from "@/schemas/client";
import trpc from "@/trpc/trpc-client";

const clientCollection = powerSyncCollection("client", (baseOptions) =>
  powerSyncCollectionOptions({
    ...baseOptions,
    schema: clientSchema,
    getKey: (item) => item.id,
    onInsert: async ({ transaction }) => {
      const { modified: newClient } = transaction.mutations[0];
      await trpc.client.create.mutate(newClient);
      await awaitSynced();
    },
    onUpdate: async ({ transaction }) => {
      const { modified: updatedClient } = transaction.mutations[0];
      await trpc.client.update.mutate(updatedClient);
      await awaitSynced();
    },
    onDelete: async ({ transaction }) => {
      const { original: deletedClient } = transaction.mutations[0];
      await trpc.client.delete.mutate({
        id: deletedClient.id,
      });
      await awaitSynced();
    },
  }),
);

export default clientCollection;
