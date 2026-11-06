import { z } from "zod";
import { zfd } from "zod-form-data";

import {
  decimalFilterSchema,
  fileNameSchema,
  nullableIdSchema,
  optionalFileSchema,
  requiredIdSchema,
  stringSchema,
  tableStateSchema,
} from "@/schemas";

const basePartSchema = z.object({
  coatingId: nullableIdSchema,
  description: stringSchema({ nullable: false }),
  length: stringSchema({ nullable: true }),
  notes: stringSchema({ nullable: true }),
  shapeId: nullableIdSchema,
  width: stringSchema({ nullable: true }),
});

export const partSchema = basePartSchema.extend({
  id: requiredIdSchema,
  deletedAt: z.coerce.date().nullable(),
});

const blueprintFileNameRequiredError = {
  error: "El nombre del archivo no puede estar vacío",
  path: ["fileName"],
};

export const createPartFormSchema = basePartSchema
  .extend({
    blueprint: z.instanceof(File).nullable(),
    fileName: fileNameSchema.or(z.literal("")).nullable(),
    reference: z.object({
      clientDescription: stringSchema({ nullable: false }),
      clientId: requiredIdSchema,
      reference: stringSchema({ nullable: false }),
    }),
  })
  .refine(
    (part) => part.blueprint === null || (part.fileName !== null && part.fileName !== ""),
    blueprintFileNameRequiredError,
  );
export type TCreatePartForm = z.infer<typeof createPartFormSchema>;

// The nested Referencia is sent flattened, FormData only holds plain fields
export const createPartFormDataSchema = zfd
  .formData({
    blueprint: optionalFileSchema,
    clientDescription: zfd.text(stringSchema({ nullable: false })),
    clientId: zfd.numeric(requiredIdSchema),
    coatingId: zfd.numeric(nullableIdSchema.default(null)),
    description: zfd.text(stringSchema({ nullable: false })),
    fileName: zfd.text(fileNameSchema.optional()),
    length: zfd.text(stringSchema({ nullable: true }).default(null)),
    notes: zfd.text(stringSchema({ nullable: true }).default(null)),
    reference: zfd.text(stringSchema({ nullable: false })),
    shapeId: zfd.numeric(nullableIdSchema.default(null)),
    width: zfd.text(stringSchema({ nullable: true }).default(null)),
  })
  .refine((part) => part.blueprint == null || part.fileName !== undefined, blueprintFileNameRequiredError);
export type TCreatePartFormData = z.infer<typeof createPartFormDataSchema>;

export const updatePartSchema = basePartSchema.extend({
  id: requiredIdSchema,
});
export type TUpdatePart = z.infer<typeof updatePartSchema>;

const partFiltersSchema = z.array(
  z.discriminatedUnion("id", [
    z.object({ id: z.literal("clientId"), value: z.number().nullable() }),
    z.object({ id: z.literal("coatingId"), value: z.number().nullable() }),
    z.object({ id: z.literal("deletedAt"), value: z.boolean().nullable() }),
    z.object({ id: z.literal("description"), value: z.string().nullable() }),
    z.object({ id: z.literal("hasCoating"), value: z.boolean().nullable() }),
    z.object({ id: z.literal("includePartReferenceNullClientId"), value: z.boolean().nullable() }),
    z.object({ id: z.literal("materialId"), value: z.number().nullable() }),
    z.object({ id: z.literal("materialRawMaterialId"), value: z.number().nullable() }),
    z.object({ id: z.literal("materialShapeId"), value: z.number().nullable() }),
    z.object({ id: z.literal("materialWidth"), value: decimalFilterSchema(1).nullable() }),
    z.object({ id: z.literal("reference"), value: z.string().nullable() }),
  ]),
);
export type TPartFilters = z.infer<typeof partFiltersSchema>;

export const PART_POPOVER_FILTER_IDS = ["clientId", "deletedAt"] as const satisfies ReadonlyArray<
  TPartFilters[number]["id"]
>;
export type TPartPopoverFilterId = (typeof PART_POPOVER_FILTER_IDS)[number];

export const tablePartStateSchema = tableStateSchema({ filtersSchema: partFiltersSchema });
export type TTablePartState = z.infer<typeof tablePartStateSchema>;
