import { createSelectSchema } from "drizzle-orm/zod";
import { z } from "zod";

import { dbTablePrinter } from "@/db/schema";
import { PRINTER_SHARE_NAME_INVALID_MESSAGE, PRINTER_HOST_INVALID_MESSAGE } from "@/messages/printer";
import { nameFiltersSchema, nameSchema, requiredIdObjectSchema, requiredIdSchema, tableStateSchema } from "@/schemas";
import { isLabelPrinterKind, isSharePrinterKind, PrinterKind } from "@/types/printer";

const REQUIRED_MESSAGE = "Campo obligatorio";

// The password stays on the server, see the sync stream of the table
export const printerSchema = createSelectSchema(dbTablePrinter, { kind: z.enum(PrinterKind) }).omit({ password: true });

const hostSchema = z
  .string({ error: REQUIRED_MESSAGE })
  .trim()
  .min(1, REQUIRED_MESSAGE)
  .regex(/^[\w.-]+$/, PRINTER_HOST_INVALID_MESSAGE);

const emptyToNull = (value: string | null) => (value === "" ? null : value);

const optionalTextSchema = z.string().trim().nullable().transform(emptyToNull);

const labelSizeSchema = z
  .number({ error: "Introduce un número entero" })
  .int("Introduce un número entero de milímetros")
  .positive("El tamaño debe ser mayor que 0")
  .nullable();

// The labels of the printer a part tag is rendered for, or null for the size of the tag itself
export const tagLabelSizeSchema = z
  .object({ labelLengthMm: labelSizeSchema.unwrap(), labelWidthMm: labelSizeSchema.unwrap() })
  .nullable();
export type TTagLabelSize = z.infer<typeof tagLabelSizeSchema>;

const printerFieldsSchema = z.object({
  address: hostSchema,
  forTags: z.boolean(),
  kind: z.enum(PrinterKind, { error: REQUIRED_MESSAGE }),
  labelLengthMm: labelSizeSchema,
  labelWidthMm: labelSizeSchema,
  name: nameSchema,
  // An empty password keeps the stored one, so the form never has to show it. Not trimmed, as spaces may be part of it
  password: z.string().nullable().transform(emptyToNull),
  shareName: z
    .string()
    .trim()
    .regex(/^[^\\/]*$/, PRINTER_SHARE_NAME_INVALID_MESSAGE)
    .nullable()
    .transform(emptyToNull),
  username: optionalTextSchema,
});

// The fields a kind of printer needs, which the others leave empty
function requireFieldsOfKind(
  printer: z.output<typeof printerFieldsSchema>,
  context: z.RefinementCtx<z.output<typeof printerFieldsSchema>>,
) {
  const requiredFields = [
    ...(isSharePrinterKind(printer.kind) ? (["shareName"] as const) : []),
    ...(isLabelPrinterKind(printer.kind) ? (["labelWidthMm", "labelLengthMm"] as const) : []),
  ];
  for (const field of requiredFields) {
    if (printer[field] === null) {
      context.addIssue({ code: "custom", message: REQUIRED_MESSAGE, path: [field] });
    }
  }
}

export const createPrinterSchema = printerFieldsSchema.superRefine(requireFieldsOfKind);
export type TCreatePrinter = z.input<typeof createPrinterSchema>;

export const updatePrinterSchema = printerFieldsSchema
  .extend(requiredIdObjectSchema.shape)
  .superRefine(requireFieldsOfKind);
export type TUpdatePrinter = z.input<typeof updatePrinterSchema>;

export const printFileSchema = z.object({
  filePath: z
    .string()
    .regex(/^\/api\/files\/[\w$/.?&=%-]+$/, "Archivo no válido")
    // fetch resolves an encoded dot segment (%2e%2e) like "..", which would leave /api/files/
    .refine((filePath) => !/\.\.|%2e/i.test(filePath), "Archivo no válido"),
  printerId: requiredIdSchema,
});

export const tablePrinterStateSchema = tableStateSchema({ filtersSchema: nameFiltersSchema });
export type TTablePrinterState = z.infer<typeof tablePrinterStateSchema>;
