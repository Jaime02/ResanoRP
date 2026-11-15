import { powerSyncCollection, powerSyncCollectionOptions } from "@/collections/base";
import { shapeSchema } from "@/schemas/shape";

const shapeCollection = powerSyncCollection("shape", (baseOptions) =>
  powerSyncCollectionOptions({
    ...baseOptions,
    schema: shapeSchema,
    getKey: (item) => item.id,
  }),
);

export default shapeCollection;
