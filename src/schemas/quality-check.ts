import { z } from "zod";

import { quantitySchema, requiredIdSchema, stringSchema } from "@/schemas";
import { featureValueSchema } from "@/schemas/part-feature";

export const qualityCheckSchema = z.object({
  checkedAt: z.coerce.date(),
  id: requiredIdSchema,
  notes: stringSchema({ nullable: true }),
  ok: z.boolean(),
  partFeatureId: requiredIdSchema,
  producedQuantity: quantitySchema,
  productionOrderId: requiredIdSchema,
  value: featureValueSchema,
});

const producedQuantitySchema = quantitySchema.min(0, "La cantidad no puede ser negativa");

export const createQualityCheckSchema = z.object({
  producedQuantity: producedQuantitySchema,
  productionOrderId: requiredIdSchema,
  results: z
    .array(
      z.object({
        notes: stringSchema({ nullable: true }),
        ok: z.boolean(),
        partFeatureId: requiredIdSchema,
        value: featureValueSchema,
      }),
    )
    .min(1),
});
export type TCreateQualityCheck = z.infer<typeof createQualityCheckSchema>;
