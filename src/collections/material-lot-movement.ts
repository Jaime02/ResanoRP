import { powerSyncCollection, powerSyncCollectionOptions } from "@/collections/base";
import { materialLotMovementSchema } from "@/schemas/material-lot";

const materialLotMovementCollection = powerSyncCollection("material_lot_movement", (baseOptions) =>
  powerSyncCollectionOptions({
    ...baseOptions,
    schema: materialLotMovementSchema,
    getKey: (item) => item.id,
  }),
);

export default materialLotMovementCollection;
