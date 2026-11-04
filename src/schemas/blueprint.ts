import { z } from "zod";
import { zfd } from "zod-form-data";

import { fileNameSchema, requiredFileSchema, requiredIdSchema, stringSchema } from "@/schemas";

const baseBlueprintSchema = z.object({
  fileName: fileNameSchema,
});

export const collectionBlueprintSchema = baseBlueprintSchema.extend({
  id: requiredIdSchema,
  fileUrl: stringSchema(),
  createdAt: z.coerce.date().nullable(),
  blueprint: z.instanceof(File),
  partId: requiredIdSchema,
});
export type TBlueprint = z.infer<typeof collectionBlueprintSchema>;

export const createBlueprintFormDataSchema = zfd.formData(
  baseBlueprintSchema.extend({
    blueprint: requiredFileSchema,
    partId: zfd.numeric(requiredIdSchema),
  }),
);
export type TCreateBlueprint = z.infer<typeof createBlueprintFormDataSchema>;

export const updateBlueprintSchema = baseBlueprintSchema.extend({
  id: requiredIdSchema,
});
export type TUpdateBlueprintForm = z.infer<typeof updateBlueprintSchema>;
