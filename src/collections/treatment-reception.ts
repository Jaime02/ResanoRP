import { electricCollectionOptions } from "@tanstack/electric-db-collection";

import { electricCollection } from "@/collections/base";
import { treatmentReceptionSchema } from "@/schemas/treatment";

const treatmentReceptionCollection = electricCollection("treatment_reception", (baseOptions) =>
  electricCollectionOptions({
    ...baseOptions,
    syncMode: "on-demand",
    schema: treatmentReceptionSchema,
    getKey: (item) => item.id,
  }),
);

export default treatmentReceptionCollection;
