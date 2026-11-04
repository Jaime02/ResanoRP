import { electricCollectionOptions } from "@tanstack/electric-db-collection";

import { electricCollection } from "@/collections/base";
import { partStockSchema } from "@/schemas/part-stock";
import trpc from "@/trpc/trpc-client";

const partStockCollection = electricCollection("part_stock", (baseOptions) =>
  electricCollectionOptions({
    ...baseOptions,
    schema: partStockSchema,
    getKey: (item) => item.id,
    onInsert: async ({ transaction, collection }) => {
      const { modified: newPartStock } = transaction.mutations[0];
      const result = await trpc.partStock.create.mutate(newPartStock);
      await collection.utils.awaitTxId(result.txid);
    },
  }),
);

export default partStockCollection;
