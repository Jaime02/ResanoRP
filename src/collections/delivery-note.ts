import { awaitSynced, powerSyncCollection, powerSyncCollectionOptions } from "@/collections/base";
import { createDeliveryNoteSchema, deliveryNoteSchema, updateDeliveryNoteSchema } from "@/schemas/delivery-note";
import trpc from "@/trpc/trpc-client";

const deliveryNoteCollection = powerSyncCollection("delivery_note", (baseOptions) =>
  powerSyncCollectionOptions({
    ...baseOptions,
    schema: deliveryNoteSchema,
    getKey: (item) => item.id,
    onInsert: async ({ transaction }) => {
      const { modified: newDeliveryNote } = transaction.mutations[0];
      const validationResult = createDeliveryNoteSchema.safeParse(newDeliveryNote);
      if (!validationResult.success) {
        throw new Error(`Invalid delivery note data: ${validationResult.error.message}`);
      }
      await trpc.deliveryNote.create.mutate(validationResult.data);
      await awaitSynced();
    },
    onUpdate: async ({ transaction }) => {
      const { modified: updatedDeliveryNote } = transaction.mutations[0];
      const validationResult = updateDeliveryNoteSchema.safeParse(updatedDeliveryNote);
      if (!validationResult.success) {
        throw new Error(`Invalid delivery note data: ${validationResult.error.message}`);
      }
      await trpc.deliveryNote.update.mutate(validationResult.data);
      await awaitSynced();
    },
    onDelete: async ({ transaction }) => {
      const { original: deletedDeliveryNote } = transaction.mutations[0];
      await trpc.deliveryNote.delete.mutate({
        id: deletedDeliveryNote.id,
      });
      await awaitSynced();
    },
  }),
);

export default deliveryNoteCollection;
