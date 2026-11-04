import { electricCollectionOptions } from "@tanstack/electric-db-collection";

import { electricCollection } from "@/collections/base";
import { treatmentShipmentSchema } from "@/schemas/treatment";

const treatmentShipmentCollection = electricCollection("treatment_shipment", (baseOptions) =>
  electricCollectionOptions({
    ...baseOptions,
    syncMode: "on-demand",
    schema: treatmentShipmentSchema,
    getKey: (item) => item.id,
  }),
);

export default treatmentShipmentCollection;
