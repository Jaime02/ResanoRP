import { electricCollectionOptions } from "@tanstack/electric-db-collection";

import { electricCollection } from "@/collections/base";
import { qualityCheckSchema } from "@/schemas/quality-check";

const qualityCheckCollection = electricCollection("quality_check", (baseOptions) =>
  electricCollectionOptions({
    ...baseOptions,
    syncMode: "on-demand",
    schema: qualityCheckSchema,
    getKey: (item) => item.id,
  }),
);

export default qualityCheckCollection;
