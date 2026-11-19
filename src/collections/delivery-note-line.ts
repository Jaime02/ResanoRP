import { awaitSynced, powerSyncCollection, powerSyncCollectionOptions } from "@/collections/base";
import { deliveryNoteLineSchema } from "@/schemas/delivery-note-line";
import trpc from "@/trpc/trpc-client";

const deliveryNoteLineCollection = powerSyncCollection("delivery_note_line", (baseOptions) =>
  powerSyncCollectionOptions({
    ...baseOptions,
    schema: deliveryNoteLineSchema,
    getKey: (item) => item.id,
    onUpdate: async ({ transaction }) => {
      const { original, changes } = transaction.mutations[0];
      await trpc.deliveryNoteLine.update.mutate({ ...changes, id: original.id });
      await awaitSynced();
    },
    onDelete: async ({ transaction }) => {
      const { original: deletedDeliveryNoteLine } = transaction.mutations[0];
      await trpc.deliveryNoteLine.delete.mutate({
        id: deletedDeliveryNoteLine.id,
      });
      await awaitSynced();
    },
  }),
);

export default deliveryNoteLineCollection;
