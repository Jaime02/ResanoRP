import { electricCollectionOptions } from "@tanstack/electric-db-collection";

import { electricCollection } from "@/collections/base";
import { configurationSchema } from "@/schemas/configuration";
import trpc from "@/trpc/trpc-client";

const configurationCollection = electricCollection("configuration", (baseOptions) =>
  electricCollectionOptions({
    ...baseOptions,
    schema: configurationSchema,
    getKey: (item) => item.id,
    onUpdate: async ({ transaction, collection }) => {
      const { modified: updatedConfiguration } = transaction.mutations[0];
      const result = await trpc.configuration.update.mutate(updatedConfiguration);
      await collection.utils.awaitTxId(result.txid);
    },
  }),
);

export default configurationCollection;
