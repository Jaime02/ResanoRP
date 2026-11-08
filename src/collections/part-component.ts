import { electricCollectionOptions } from "@tanstack/electric-db-collection";

import { electricCollection } from "@/collections/base";
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

const partComponentCollection = electricCollection("part_component", (baseOptions) =>
  electricCollectionOptions({
    ...baseOptions,
    syncMode: "on-demand",
    schema: partComponentSchema,
    getKey: getPartComponentKey,
    onInsert: async ({ transaction, collection }) => {
      const { modified: newPartComponent } = transaction.mutations[0];
      const result = await trpc.partComponent.create.mutate(newPartComponent);
      await collection.utils.awaitTxId(result.txid);
    },
    onUpdate: async ({ transaction, collection }) => {
      const { modified: updatedPartComponent } = transaction.mutations[0];
      const result = await trpc.partComponent.update.mutate(updatedPartComponent);
      await collection.utils.awaitTxId(result.txid);
    },
    onDelete: async ({ transaction, collection }) => {
      const { original: deletedPartComponent } = transaction.mutations[0];
      const result = await trpc.partComponent.delete.mutate(deletedPartComponent);
      await collection.utils.awaitTxId(result.txid);
    },
  }),
);

export default partComponentCollection;
