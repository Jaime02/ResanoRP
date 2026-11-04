import { electricCollectionOptions } from "@tanstack/electric-db-collection";

import { electricCollection } from "@/collections/base";
import { partProductionSchema } from "@/schemas/part-production";

const partProductionCollection = electricCollection("part_production", (baseOptions) =>
  electricCollectionOptions({
    ...baseOptions,
    syncMode: "on-demand",
    schema: partProductionSchema,
    getKey: (item) => item.id,
  }),
);

export default partProductionCollection;
