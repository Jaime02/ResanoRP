import { powerSyncCollection, powerSyncCollectionOptions } from "@/collections/base";
import { partStockSchema } from "@/schemas/part-stock";

const partStockCollection = powerSyncCollection("part_stock", (baseOptions) =>
  powerSyncCollectionOptions({
    ...baseOptions,
    schema: partStockSchema,
    getKey: (item) => item.id,
  }),
);

export default partStockCollection;
