import { awaitSynced, powerSyncCollection, powerSyncCollectionOptions } from "@/collections/base";
import { partStockSchema } from "@/schemas/part-stock";
import trpc from "@/trpc/trpc-client";

const partStockCollection = powerSyncCollection("part_stock", (baseOptions) =>
  powerSyncCollectionOptions({
    ...baseOptions,
    schema: partStockSchema,
    getKey: (item) => item.id,
    onInsert: async ({ transaction }) => {
      const { modified: newPartStock } = transaction.mutations[0];
      await trpc.partStock.create.mutate(newPartStock);
      await awaitSynced();
    },
  }),
);

export default partStockCollection;
