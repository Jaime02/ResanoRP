import z from "zod";

import { nameFiltersSchema, nullableIdSchema, requiredIdSchema, stringSchema, tableStateSchema } from "@/schemas";

const basePartReferenceSchema = z.object({
  clientDescription: stringSchema({ nullable: true }),
  reference: stringSchema({ nullable: false }),
});

export const partReferenceSchema = basePartReferenceSchema.extend({
  id: requiredIdSchema,
  partId: requiredIdSchema,
  clientId: nullableIdSchema,
  deletedAt: z.coerce.date().nullable(),
});

export const createPartReferenceSchema = basePartReferenceSchema.extend({
  partId: requiredIdSchema,
  clientId: nullableIdSchema,
});
export type TCreatePartReference = z.infer<typeof createPartReferenceSchema>;

export const updatePartReferenceSchema = basePartReferenceSchema.extend({
  id: requiredIdSchema,
  clientId: nullableIdSchema,
});
export type TUpdatePartReference = z.infer<typeof updatePartReferenceSchema>;

const tablePartReferenceStateSchema = tableStateSchema({ filtersSchema: nameFiltersSchema });
export type TTablePartReferenceState = z.infer<typeof tablePartReferenceStateSchema>;
