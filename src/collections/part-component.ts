import { awaitSynced, powerSyncCollection, powerSyncCollectionOptions } from "@/collections/base";
import { partComponentSchema } from "@/schemas/part-component";
import trpc from "@/trpc/trpc-client";

export function getPartComponentKey({
  parentPartId,
  componentPartId,
}: {
  parentPartId: number;
  componentPartId: number;
}) {
  return `${parentPartId}-${componentPartId}`;
}

const partComponentCollection = powerSyncCollection("part_component", (baseOptions) =>
  powerSyncCollectionOptions({
    ...baseOptions,
    schema: partComponentSchema,
    getKey: getPartComponentKey,
    onInsert: async ({ transaction }) => {
      const { modified: newPartComponent } = transaction.mutations[0];
      await trpc.partComponent.create.mutate(newPartComponent);
      await awaitSynced();
    },
    onUpdate: async ({ transaction }) => {
      const { modified: updatedPartComponent } = transaction.mutations[0];
      await trpc.partComponent.update.mutate(updatedPartComponent);
      await awaitSynced();
    },
    onDelete: async ({ transaction }) => {
      const { original: deletedPartComponent } = transaction.mutations[0];
      await trpc.partComponent.delete.mutate(deletedPartComponent);
      await awaitSynced();
    },
  }),
);

export default partComponentCollection;
