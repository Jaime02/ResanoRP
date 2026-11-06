import { z } from "zod";
import { zfd } from "zod-form-data";

import { LoggerLevels } from "@/logging/types";

export const requiredIdSchema = z.number({ error: "Campo obligatorio" }).int().positive();
export const nullableIdSchema = requiredIdSchema.nullable();
export const optionalIdSchema = requiredIdSchema.optional();

export const requiredIdObjectSchema = z.object({
  id: requiredIdSchema,
});

interface SchemaFunctionProps {
  errorMessage?: string;
  nullable?: boolean;
  optional?: boolean;
}

export const requiredDateSchema = z.preprocess(
  (value) => value ?? undefined,
  z.coerce.date({ error: "Campo obligatorio" }),
);
export const nullableDateSchema = z.coerce.date().nullable();
export type TBaseModel = {
  id: z.infer<typeof requiredIdSchema>;
  deletedAt?: z.infer<typeof nullableDateSchema>;
};

export const coercedIdObjectSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export function stringSchema(params?: SchemaFunctionProps & { nullable?: false }): z.ZodString;
export function stringSchema(
  params: SchemaFunctionProps & { nullable: true },
): z.ZodPipe<z.ZodNullable<z.ZodString>, z.ZodTransform<string | null, string | null>>;

export function stringSchema({
  errorMessage = "Campo obligatorio",
  nullable = false,
}: SchemaFunctionProps | undefined = {}) {
  const schema = z.string({ error: errorMessage });
  if (nullable) {
    return schema.nullable().transform((val) => (val === "" ? null : val));
  }
  return schema.min(1, errorMessage);
}

const sortSchema = z.object({
  desc: z.boolean().nonoptional(),
  id: stringSchema({ nullable: false }),
});
export type TSort = z.infer<typeof sortSchema>;

const baseModelWithNameSchema = z.object({
  name: stringSchema({ nullable: false }),
});

const modelWithNameSchema = baseModelWithNameSchema.extend(requiredIdObjectSchema.shape);

export const createModelWithNameSchema = baseModelWithNameSchema;
export type TCreateModelWithName = z.infer<typeof createModelWithNameSchema>;

export const updateModelWithNameSchema = modelWithNameSchema;
export type TUpdateModelWithName = z.infer<typeof updateModelWithNameSchema>;

export const emailSchema = z.email("Introduce una dirección de correo válida");

export function decimalSchema(decimals: number) {
  return z
    .string()
    .regex(new RegExp(`^-?\\d+(\\.\\d{1,${decimals}})?$`), `Introduce un número de hasta ${decimals} decimales`)
    .or(z.literal(""));
}

// A filter is saved in the URL on every keystroke, so it must accept a number still being typed, like "10." before its
// decimals, or the whole table state would be discarded
export function decimalFilterSchema(decimals: number) {
  return z.string().regex(new RegExp(`^-?\\d+(\\.\\d{0,${decimals}})?$`));
}

export const quantitySchema = z
  .number({ error: "Introduce un número entero" })
  .int("La cantidad debe ser un número entero");

export const positiveQuantitySchema = quantitySchema.gt(0, "La cantidad debe ser un número positivo");

// A negative quantity is a return, which the old system also recorded as a Línea
export const nonZeroQuantitySchema = quantitySchema.refine((quantity) => quantity !== 0, "La cantidad no puede ser 0");

export const priceSchema = decimalSchema(3);

export const vatPercentageSchema = z
  .number({ error: "Campo obligatorio" })
  .int("El IVA debe ser un número entero")
  .gte(0, "El IVA no puede ser negativo")
  .lte(100, "El IVA no puede ser mayor que 100");

export const dateRangeFilterSchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});
export type DateRangeFilter = z.infer<typeof dateRangeFilterSchema>;

export type TFilterValue = string | number | boolean | DateRangeFilter | Array<TFilterValue> | null;
const filterValueSchema: z.ZodType<TFilterValue> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), dateRangeFilterSchema, z.array(filterValueSchema), z.null()]),
);

const filtersSchema = z.array(z.record(z.string(), filterValueSchema));
export type TBaseFilters = z.infer<typeof filtersSchema>;

export function tableStateSchema<
  T extends z.ZodArray<
    z.ZodType<{
      id: string;
      value: TFilterValue;
    }>
  >,
>({ filtersSchema }: { filtersSchema: T }) {
  return z.object({
    filters: filtersSchema.optional(),
    pagination: paginationSchema.optional().nullable(),
    sorts: z.array(sortSchema).optional(),
  });
}
export type TTableState = z.infer<ReturnType<typeof tableStateSchema>>;

export const requiredFileSchema = zfd.file(z.instanceof(File));
export const optionalFileSchema = zfd.file(z.instanceof(File).optional().nullable()).optional();

// The file is saved as "<name>.pdf" and file systems limit a name to 255 bytes, not characters
const MAX_FILE_NAME_BYTES = 255 - ".pdf".length;

export const fileNameSchema = z
  .string()
  .min(1, "El nombre del archivo no puede estar vacío")
  .regex(/^[^<>:"/\\|?*]+$/, "Carácteres inválidos en el nombre del archivo")
  .transform((s) => s.replace(/(\.pdf|[ .])+$/i, ""))
  .refine((name) => name.length > 0, { error: "El nombre del archivo no puede estar vacío" })
  .refine((name) => new TextEncoder().encode(name).length <= MAX_FILE_NAME_BYTES, {
    error: "Nombre del archivo demasiado largo",
  })
  .refine((name) => !/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(name), {
    error: "Nombre de archivo no permitido",
  });

export const clientErrorSchema = z.object({
  level: z.enum(LoggerLevels),
  message: z.string().min(1, "Error message is required"),
  meta: z.record(z.string(), z.any()).optional(),
});

export const nameFiltersSchema = z.array(
  z.discriminatedUnion("id", [
    z.object({ id: z.literal("deletedAt"), value: z.boolean().nullable() }),
    z.object({ id: z.literal("excludeItemIds"), value: z.array(z.number()).nullable() }),
    z.object({ id: z.literal("name"), value: z.string().nullable() }),
  ]),
);
export type TNameFilters = z.infer<typeof nameFiltersSchema>;

const paginationSchema = z.object({
  pageIndex: z.number().int().nonnegative().optional(),
  pageSize: z.number().int().nonnegative().optional(),
});
export type TPagination = z.infer<typeof paginationSchema>;
