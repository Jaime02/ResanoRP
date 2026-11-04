import { electricCollectionOptions } from "@tanstack/electric-db-collection";

import { electricCollection } from "@/collections/base";
import { clientInvoiceEmailSchema } from "@/schemas/client-invoice-email";
import trpc from "@/trpc/trpc-client";

const clientInvoiceEmailCollection = electricCollection("client_invoice_email", (baseOptions) =>
  electricCollectionOptions({
    ...baseOptions,
    schema: clientInvoiceEmailSchema,
    getKey: (item) => item.id,
    onInsert: async ({ transaction, collection }) => {
      const { modified: newClientInvoiceEmail } = transaction.mutations[0];
      const result = await trpc.clientInvoiceEmail.create.mutate(newClientInvoiceEmail);
      await collection.utils.awaitTxId(result.txid);
    },
    onDelete: async ({ transaction, collection }) => {
      const { original: deletedClientInvoiceEmail } = transaction.mutations[0];
      const result = await trpc.clientInvoiceEmail.delete.mutate({
        id: deletedClientInvoiceEmail.id,
      });
      await collection.utils.awaitTxId(result.txid);
    },
  }),
);

export default clientInvoiceEmailCollection;
