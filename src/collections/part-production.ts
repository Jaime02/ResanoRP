import { powerSyncCollection, powerSyncCollectionOptions } from "@/collections/base";
import { partProductionSchema } from "@/schemas/part-production";

const partProductionCollection = powerSyncCollection("part_production", (baseOptions) =>
  powerSyncCollectionOptions({
    ...baseOptions,
    schema: partProductionSchema,
    getKey: (item) => item.id,
  }),
);

export default partProductionCollection;
