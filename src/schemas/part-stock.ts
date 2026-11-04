import z from "zod";

import { quantitySchema, requiredIdSchema } from "@/schemas";

const basePartStockSchema = z.object({
  partId: requiredIdSchema,
  quantity: quantitySchema,
});

export const partStockSchema = basePartStockSchema.extend({ id: requiredIdSchema, date: z.coerce.date() });

export const createPartStockSchema = basePartStockSchema;
export type TCreatePartStock = z.infer<typeof createPartStockSchema>;
