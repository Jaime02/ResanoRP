import { z } from "zod";
import { zfd } from "zod-form-data";

import { NON_NEGATIVE_QUANTITY_MESSAGE, REQUIRED_FIELD_MESSAGE } from "@/messages/common";
import { MATERIAL_LOT_USE_WITHOUT_ORDER_MESSAGE } from "@/messages/material-lot";
import {
  nullableIdSchema,
  optionalFileSchema,
  positiveQuantitySchema,
  quantitySchema,
  requiredDateSchema,
  requiredIdSchema,
  stringSchema,
} from "@/schemas";
import { MaterialLotMovementMode, MaterialLotUnit } from "@/types/material-lot";

const heatSchema = stringSchema({ nullable: true });
const unitSchema = z.enum(MaterialLotUnit, { error: REQUIRED_FIELD_MESSAGE });

const baseMaterialLotSchema = z.object({
  heat: heatSchema,
  materialId: requiredIdSchema,
  receivedAt: requiredDateSchema,
  receivedQuantity: positiveQuantitySchema,
  unit: unitSchema,
});

export const materialLotSchema = baseMaterialLotSchema.extend({
  id: requiredIdSchema,
  hasCertificate: z.boolean(),
  receivedAt: z.coerce.date(),
});

// The id is null when creating, the server checks it with the schema of each mutation. The certificate is kept out of
// the form: a File in its values makes the types of the form too deep to check
export const materialLotFormSchema = baseMaterialLotSchema.extend({
  id: nullableIdSchema,
  receivedAt: z.date({ error: REQUIRED_FIELD_MESSAGE }),
});
export type TMaterialLotForm = z.infer<typeof materialLotFormSchema>;

const materialLotFormDataShape = {
  certificate: optionalFileSchema,
  heat: zfd.text(heatSchema.default(null)),
  materialId: zfd.numeric(requiredIdSchema),
  receivedAt: zfd.text(requiredDateSchema),
  receivedQuantity: zfd.numeric(positiveQuantitySchema),
  unit: zfd.text(unitSchema),
};

export const createMaterialLotFormDataSchema = zfd.formData(materialLotFormDataShape);

export const updateMaterialLotFormDataSchema = zfd.formData({
  ...materialLotFormDataShape,
  id: zfd.numeric(requiredIdSchema),
});

export const materialLotMovementSchema = z.object({
  date: z.coerce.date(),
  id: requiredIdSchema,
  materialLotId: requiredIdSchema,
  productionOrderId: nullableIdSchema,
  quantity: quantitySchema,
});

export const createMaterialLotMovementSchema = z
  .object({
    materialLotId: requiredIdSchema,
    productionOrderId: nullableIdSchema,
    quantity: quantitySchema,
  })
  .refine((movement) => movement.quantity !== 0 || movement.productionOrderId !== null, {
    error: MATERIAL_LOT_USE_WITHOUT_ORDER_MESSAGE,
    path: ["quantity"],
  });
export type TCreateMaterialLotMovement = z.infer<typeof createMaterialLotMovementSchema>;

// The quantity is typed without its sign. Only an Orden de producción can record that it used a Colada without taking
// stock, with a quantity of 0 or none
export function getMaterialLotMovementFormSchema(mode: MaterialLotMovementMode, productionOrderId: number | null) {
  return z.object({
    materialLotId: requiredIdSchema,
    quantity:
      mode === MaterialLotMovementMode.Take && productionOrderId !== null
        ? quantitySchema.gte(0, NON_NEGATIVE_QUANTITY_MESSAGE).nullable()
        : positiveQuantitySchema,
  });
}
