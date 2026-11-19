import { awaitSynced, powerSyncCollection, powerSyncCollectionOptions } from "@/collections/base";
import { machineSchema } from "@/schemas/machine";
import trpc from "@/trpc/trpc-client";

const machineCollection = powerSyncCollection("machine", (baseOptions) =>
  powerSyncCollectionOptions({
    ...baseOptions,
    schema: machineSchema,
    getKey: (item) => item.id,
    onDelete: async ({ transaction }) => {
      const { original: deletedMachine } = transaction.mutations[0];
      await trpc.machine.delete.mutate({
        id: deletedMachine.id,
      });
      await awaitSynced();
    },
  }),
);

export default machineCollection;
