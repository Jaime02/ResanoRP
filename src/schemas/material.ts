import { z } from "zod";

import {
  decimalFilterSchema,
  decimalSchema,
  nullableIdSchema,
  requiredIdSchema,
  stringSchema,
  tableStateSchema,
} from "@/schemas";

const baseMaterialSchema = z.object({
  rawMaterialId: requiredIdSchema,
  shapeId: nullableIdSchema,
  width: decimalSchema(1),
});

export const materialSchema = baseMaterialSchema.extend({
  id: requiredIdSchema,
  deletedAt: z.coerce.date().nullable(),
});

export const createMaterialSchema = baseMaterialSchema;
export type TCreateMaterial = z.infer<typeof createMaterialSchema>;

const materialFiltersSchema = z.array(
  z.discriminatedUnion("id", [
    z.object({ id: z.literal("deletedAt"), value: z.boolean().nullable() }),
    z.object({ id: z.literal("rawMaterialId"), value: z.number().nullable() }),
    z.object({ id: z.literal("shapeId"), value: z.number().nullable() }),
    z.object({ id: z.literal("width"), value: decimalFilterSchema(1).nullable() }),
  ]),
);
export type TMaterialFilters = z.infer<typeof materialFiltersSchema>;

export const compatibleMaterialsSchema = z.object({
  partId: requiredIdSchema,
  rawMaterialId: z.number().optional(),
  shapeId: z.number().optional().nullable(),
  width: stringSchema({ nullable: true }),
});

export const tableMaterialStateSchema = tableStateSchema({ filtersSchema: materialFiltersSchema });
export type TTableMaterialState = z.infer<typeof tableMaterialStateSchema>;
