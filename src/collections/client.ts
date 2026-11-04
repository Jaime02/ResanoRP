import { electricCollectionOptions } from "@tanstack/electric-db-collection";

import { electricCollection } from "@/collections/base";
import clientInvoiceEmailCollection from "@/collections/client-invoice-email";
import { clientSchema } from "@/schemas/client";
import trpc from "@/trpc/trpc-client";

const clientCollection = electricCollection("client", (baseOptions, dbClient) =>
  electricCollectionOptions({
    ...baseOptions,
    schema: clientSchema,
    getKey: (item) => item.id,
    onInsert: async ({ transaction, collection }) => {
      const { modified: newClient } = transaction.mutations[0];
      const result = await trpc.client.create.mutate(newClient);
      await collection.utils.awaitTxId(result.txid);
    },
    onUpdate: async ({ transaction, collection }) => {
      const { modified: updatedClient } = transaction.mutations[0];
      const result = await trpc.client.update.mutate(updatedClient);
      await collection.utils.awaitTxId(result.txid);
    },
    onDelete: async ({ transaction, collection }) => {
      const { original: deletedClient } = transaction.mutations[0];
      const result = await trpc.client.delete.mutate({
        id: deletedClient.id,
      });
      // Awaiting a collection the delete did not write times out
      await Promise.all([
        collection.utils.awaitTxId(result.txid),
        ...(result.deletedClientInvoiceEmailIds.length > 0
          ? [dbClient.collection(clientInvoiceEmailCollection).utils.awaitTxId(result.txid)]
          : []),
      ]);
    },
  }),
);

export default clientCollection;
