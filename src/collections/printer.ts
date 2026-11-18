import { awaitSynced, powerSyncCollection, powerSyncCollectionOptions } from "@/collections/base";
import { printerSchema } from "@/schemas/printer";
import trpc from "@/trpc/trpc-client";

const printerCollection = powerSyncCollection("printer", (baseOptions) =>
  powerSyncCollectionOptions({
    ...baseOptions,
    schema: printerSchema,
    getKey: (item) => item.id,
    onInsert: async ({ transaction }) => {
      const { modified: newPrinter } = transaction.mutations[0];
      // The synced row has no password, and an empty one keeps the stored one
      await trpc.printer.create.mutate({ ...newPrinter, password: null });
      await awaitSynced();
    },
    onUpdate: async ({ transaction }) => {
      const { modified: updatedPrinter } = transaction.mutations[0];
      await trpc.printer.update.mutate({ ...updatedPrinter, password: null });
      await awaitSynced();
    },
    onDelete: async ({ transaction }) => {
      const { original: deletedPrinter } = transaction.mutations[0];
      await trpc.printer.delete.mutate({ id: deletedPrinter.id });
      await awaitSynced();
    },
  }),
);

export default printerCollection;
