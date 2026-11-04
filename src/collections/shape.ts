import { electricCollectionOptions } from "@tanstack/electric-db-collection";

import { electricCollection } from "@/collections/base";
import { shapeSchema } from "@/schemas/shape";

const shapeCollection = electricCollection("shape", (baseOptions) =>
  electricCollectionOptions({
    ...baseOptions,
    schema: shapeSchema,
    getKey: (item) => item.id,
  }),
);

export default shapeCollection;
