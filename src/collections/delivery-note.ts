import { awaitSynced, powerSyncCollection, powerSyncCollectionOptions } from "@/collections/base";
import { deliveryNoteSchema } from "@/schemas/delivery-note";
import trpc from "@/trpc/trpc-client";

const deliveryNoteCollection = powerSyncCollection("delivery_note", (baseOptions) =>
  powerSyncCollectionOptions({
    ...baseOptions,
    schema: deliveryNoteSchema,
    getKey: (item) => item.id,
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
