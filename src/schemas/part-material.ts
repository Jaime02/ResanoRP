import z from "zod";

import { requiredIdSchema } from "@/schemas";

export const partMaterialSchema = z.object({
  materialId: requiredIdSchema,
  partId: requiredIdSchema,
});
