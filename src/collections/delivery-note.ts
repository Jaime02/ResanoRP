import { electricCollectionOptions } from "@tanstack/electric-db-collection";

import { electricCollection } from "@/collections/base";
import { createDeliveryNoteSchema, deliveryNoteSchema, updateDeliveryNoteSchema } from "@/schemas/delivery-note";
import trpc from "@/trpc/trpc-client";

const deliveryNoteCollection = electricCollection("delivery_note", (baseOptions) =>
  electricCollectionOptions({
    ...baseOptions,
    syncMode: "on-demand",
    schema: deliveryNoteSchema,
    getKey: (item) => item.id,
    onInsert: async ({ transaction, collection }) => {
      const { modified: newDeliveryNote } = transaction.mutations[0];
      const validationResult = createDeliveryNoteSchema.safeParse(newDeliveryNote);
      if (!validationResult.success) {
        throw new Error(`Invalid delivery note data: ${validationResult.error.message}`);
      }
      const result = await trpc.deliveryNote.create.mutate(validationResult.data);
      await collection.utils.awaitTxId(result.txid);
    },
    onUpdate: async ({ transaction, collection }) => {
      const { modified: updatedDeliveryNote } = transaction.mutations[0];
      const validationResult = updateDeliveryNoteSchema.safeParse(updatedDeliveryNote);
      if (!validationResult.success) {
        throw new Error(`Invalid delivery note data: ${validationResult.error.message}`);
      }
      const result = await trpc.deliveryNote.update.mutate(validationResult.data);
      await collection.utils.awaitTxId(result.txid);
    },
    onDelete: async ({ transaction, collection }) => {
      const { original: deletedDeliveryNote } = transaction.mutations[0];
      const result = await trpc.deliveryNote.delete.mutate({
        id: deletedDeliveryNote.id,
      });
      await collection.utils.awaitTxId(result.txid);
    },
  }),
);

export default deliveryNoteCollection;
