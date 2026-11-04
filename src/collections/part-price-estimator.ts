import { electricCollectionOptions } from "@tanstack/electric-db-collection";

import { electricCollection } from "@/collections/base";
import { partPriceEstimatorSchema } from "@/schemas/part-price-estimator";

const partPriceEstimatorCollection = electricCollection("part_price_estimator", (baseOptions) =>
  electricCollectionOptions({
    ...baseOptions,
    syncMode: "on-demand",
    schema: partPriceEstimatorSchema,
    getKey: (item) => item.partId,
  }),
);

export default partPriceEstimatorCollection;
