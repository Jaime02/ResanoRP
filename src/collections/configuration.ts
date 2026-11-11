import { awaitSynced, powerSyncCollection, powerSyncCollectionOptions } from "@/collections/base";
import { configurationSchema } from "@/schemas/configuration";
import trpc from "@/trpc/trpc-client";

const configurationCollection = powerSyncCollection("configuration", (baseOptions) =>
  powerSyncCollectionOptions({
    ...baseOptions,
    schema: configurationSchema,
    getKey: (item) => item.id,
    onUpdate: async ({ transaction }) => {
      const { modified: updatedConfiguration } = transaction.mutations[0];
      await trpc.configuration.update.mutate(updatedConfiguration);
      await awaitSynced();
    },
  }),
);

export default configurationCollection;
