import { awaitSynced, powerSyncCollection, powerSyncCollectionOptions } from "@/collections/base";
import { clientInvoiceEmailSchema } from "@/schemas/client-invoice-email";
import trpc from "@/trpc/trpc-client";

const clientInvoiceEmailCollection = powerSyncCollection("client_invoice_email", (baseOptions) =>
  powerSyncCollectionOptions({
    ...baseOptions,
    schema: clientInvoiceEmailSchema,
    getKey: (item) => item.id,
    onDelete: async ({ transaction }) => {
      const { original: deletedClientInvoiceEmail } = transaction.mutations[0];
      await trpc.clientInvoiceEmail.delete.mutate({
        id: deletedClientInvoiceEmail.id,
      });
      await awaitSynced();
    },
  }),
);

export default clientInvoiceEmailCollection;
