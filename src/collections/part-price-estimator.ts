import { powerSyncCollection, powerSyncCollectionOptions } from "@/collections/base";
import { partPriceEstimatorSchema } from "@/schemas/part-price-estimator";

const partPriceEstimatorCollection = powerSyncCollection("part_price_estimator", (baseOptions) =>
  powerSyncCollectionOptions({
    ...baseOptions,
    schema: partPriceEstimatorSchema,
    getKey: (item) => item.partId,
  }),
);

export default partPriceEstimatorCollection;
