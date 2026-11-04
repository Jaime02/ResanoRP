import { electricCollectionOptions } from "@tanstack/electric-db-collection";

import { electricCollection } from "@/collections/base";
import { partPriceSchema } from "@/schemas/part-price";
import trpc from "@/trpc/trpc-client";

const partPriceCollection = electricCollection("part_price", (baseOptions) =>
  electricCollectionOptions({
    ...baseOptions,
    syncMode: "on-demand",
    schema: partPriceSchema,
    getKey: (item) => item.id,
    onInsert: async ({ transaction, collection }) => {
      const { modified: newPartPrice } = transaction.mutations[0];
      const result = await trpc.partPrice.create.mutate(newPartPrice);
      await collection.utils.awaitTxId(result.txid);
    },
    onUpdate: async ({ transaction, collection }) => {
      const { modified: updatedPartPrice } = transaction.mutations[0];
      const result = await trpc.partPrice.update.mutate(updatedPartPrice);
      await collection.utils.awaitTxId(result.txid);
    },
    onDelete: async ({ transaction, collection }) => {
      const { original: deletedPartPrice } = transaction.mutations[0];
      const result = await trpc.partPrice.delete.mutate({
        id: deletedPartPrice.id,
      });
      await collection.utils.awaitTxId(result.txid);
    },
  }),
);

export default partPriceCollection;
