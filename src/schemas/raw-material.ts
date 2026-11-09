import { z } from "zod";

import {
  decimalSchema,
  nameFiltersSchema,
  nameSchema,
  priceSchema,
  requiredIdObjectSchema,
  requiredIdSchema,
  tableStateSchema,
  nullableDateSchema,
} from "@/schemas";

const baseRawMaterialSchema = z.object({
  name: nameSchema,
  price: priceSchema.nullable(),
  density: decimalSchema(3).nullable(),
});

export const rawMaterialSchema = baseRawMaterialSchema.extend({
  id: requiredIdSchema,
  deletedAt: nullableDateSchema,
});

export const createRawMaterialSchema = baseRawMaterialSchema;
export type TCreateRawMaterial = z.infer<typeof createRawMaterialSchema>;

export const updateRawMaterialSchema = baseRawMaterialSchema.extend(requiredIdObjectSchema.shape);
export type TUpdateRawMaterial = z.infer<typeof updateRawMaterialSchema>;

export const tableRawMaterialStateSchema = tableStateSchema({ filtersSchema: nameFiltersSchema });
export type TTableRawMaterialState = z.infer<typeof tableRawMaterialStateSchema>;
