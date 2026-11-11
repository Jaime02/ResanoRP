import { powerSyncCollection, powerSyncCollectionOptions } from "@/collections/base";
import { treatmentReceptionSchema } from "@/schemas/treatment";

const treatmentReceptionCollection = powerSyncCollection("treatment_reception", (baseOptions) =>
  powerSyncCollectionOptions({
    ...baseOptions,
    schema: treatmentReceptionSchema,
    getKey: (item) => item.id,
  }),
);

export default treatmentReceptionCollection;
