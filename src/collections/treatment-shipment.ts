import { powerSyncCollection, powerSyncCollectionOptions } from "@/collections/base";
import { treatmentShipmentSchema } from "@/schemas/treatment";

const treatmentShipmentCollection = powerSyncCollection("treatment_shipment", (baseOptions) =>
  powerSyncCollectionOptions({
    ...baseOptions,
    schema: treatmentShipmentSchema,
    getKey: (item) => item.id,
  }),
);

export default treatmentShipmentCollection;
