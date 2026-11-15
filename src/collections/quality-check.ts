import { powerSyncCollection, powerSyncCollectionOptions } from "@/collections/base";
import { qualityCheckSchema } from "@/schemas/quality-check";

const qualityCheckCollection = powerSyncCollection("quality_check", (baseOptions) =>
  powerSyncCollectionOptions({
    ...baseOptions,
    schema: qualityCheckSchema,
    getKey: (item) => item.id,
  }),
);

export default qualityCheckCollection;
