import { awaitSynced, powerSyncCollection, powerSyncCollectionOptions } from "@/collections/base";
import { printerSchema } from "@/schemas/printer";
import trpc from "@/trpc/trpc-client";

const printerCollection = powerSyncCollection("printer", (baseOptions) =>
  powerSyncCollectionOptions({
    ...baseOptions,
    schema: printerSchema,
    getKey: (item) => item.id,
    onDelete: async ({ transaction }) => {
      const { original: deletedPrinter } = transaction.mutations[0];
      await trpc.printer.delete.mutate({ id: deletedPrinter.id });
      await awaitSynced();
    },
  }),
);

export default printerCollection;
