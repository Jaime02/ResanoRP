import { electricCollectionOptions } from "@tanstack/electric-db-collection";

import { electricCollection } from "@/collections/base";
import invoiceCollection from "@/collections/invoice";
import sellOrderLineCollection from "@/collections/sell-order-line";
import { deliveryNoteLineSchema } from "@/schemas/delivery-note-line";
import trpc from "@/trpc/trpc-client";

const deliveryNoteLineCollection = electricCollection("delivery_note_line", (baseOptions, dbClient) =>
  electricCollectionOptions({
    ...baseOptions,
    syncMode: "on-demand",
    schema: deliveryNoteLineSchema,
    getKey: (item) => item.id,
    onInsert: async ({ transaction, collection }) => {
      const { modified: newDeliveryNoteLine } = transaction.mutations[0];
      const result = await trpc.deliveryNoteLine.create.mutate(newDeliveryNoteLine);
      await collection.utils.awaitTxId(result.txid);
    },
    onUpdate: async ({ transaction, collection }) => {
      const { modified: updatedDeliveryNoteLine } = transaction.mutations[0];
      const result = await trpc.deliveryNoteLine.update.mutate(updatedDeliveryNoteLine);
      await Promise.all([
        collection.utils.awaitTxId(result.txid),
        // Awaiting a collection the update did not write times out
        ...(result.resetInvoiceIds.length > 0
          ? [dbClient.collection(invoiceCollection).utils.awaitTxId(result.txid)]
          : []),
        ...(result.updatedSellOrderLineIds.length > 0
          ? [dbClient.collection(sellOrderLineCollection).utils.awaitTxId(result.txid)]
          : []),
      ]);
    },
    onDelete: async ({ transaction, collection }) => {
      const { original: deletedDeliveryNoteLine } = transaction.mutations[0];
      const result = await trpc.deliveryNoteLine.delete.mutate({
        id: deletedDeliveryNoteLine.id,
      });
      await collection.utils.awaitTxId(result.txid);
    },
  }),
);

export default deliveryNoteLineCollection;
