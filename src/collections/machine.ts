import { electricCollectionOptions } from "@tanstack/electric-db-collection";

import { electricCollection } from "@/collections/base";
import machineProductionOrderQueueCollection from "@/collections/machine-production-order-queue";
import { machineSchema } from "@/schemas/machine";
import trpc from "@/trpc/trpc-client";

const machineCollection = electricCollection("machine", (baseOptions, dbClient) =>
  electricCollectionOptions({
    ...baseOptions,
    schema: machineSchema,
    getKey: (item) => item.id,
    onInsert: async ({ transaction, collection }) => {
      const { modified: newMachine } = transaction.mutations[0];
      const result = await trpc.machine.create.mutate(newMachine);
      await collection.utils.awaitTxId(result.txid);
    },
    onUpdate: async ({ transaction, collection }) => {
      const { modified: updatedMachine } = transaction.mutations[0];
      const result = await trpc.machine.update.mutate(updatedMachine);
      await collection.utils.awaitTxId(result.txid);
    },
    onDelete: async ({ transaction, collection }) => {
      const { original: deletedMachine } = transaction.mutations[0];
      const result = await trpc.machine.delete.mutate({
        id: deletedMachine.id,
      });
      // Awaiting a collection the delete did not write times out
      await Promise.all([
        collection.utils.awaitTxId(result.txid),
        ...(result.removedFromQueue
          ? [dbClient.collection(machineProductionOrderQueueCollection).utils.awaitTxId(result.txid)]
          : []),
      ]);
    },
  }),
);

export default machineCollection;
