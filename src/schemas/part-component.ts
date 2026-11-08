import z from "zod";

import { positiveQuantitySchema, requiredIdSchema } from "@/schemas";

export const partComponentKeySchema = z.object({
  componentPartId: requiredIdSchema,
  parentPartId: requiredIdSchema,
});

export const partComponentSchema = partComponentKeySchema.extend({ quantity: positiveQuantitySchema });
export type TPartComponent = z.infer<typeof partComponentSchema>;
