import { z } from "zod";

import {
  nameFiltersSchema,
  nonZeroQuantitySchema,
  nullableIdSchema,
  positiveQuantitySchema,
  priceSchema,
  requiredIdSchema,
  tableStateSchema,
  stringSchema,
  vatPercentageSchema,
} from "@/schemas";
import { tagLabelSizeSchema } from "@/schemas/printer";

const baseDeliveryNoteLineSchema = z.object({
  description: stringSchema({ nullable: false }),
  quantity: nonZeroQuantitySchema,
});

export const deliveryNoteLineSchema = baseDeliveryNoteLineSchema.extend({
  id: requiredIdSchema,
  deliveryNoteId: requiredIdSchema,
  partReferenceId: nullableIdSchema,
  sellOrderLineId: nullableIdSchema,
  unitPrice: priceSchema.nullable(),
  vatPercentage: vatPercentageSchema,
});

const baseCreateDeliveryNoteLineSchema = baseDeliveryNoteLineSchema.extend({
  deliveryNoteId: requiredIdSchema,
  unitPrice: priceSchema.nullable().transform((unitPrice) => (unitPrice === "" ? null : unitPrice)),
});

// The form validates each kind of Línea with its own schema, because an error on a field it hides would block it
export const createPartDeliveryNoteLineSchema = baseCreateDeliveryNoteLineSchema.extend({
  partReferenceId: requiredIdSchema,
});

export const createCustomDeliveryNoteLineSchema = baseCreateDeliveryNoteLineSchema.extend({
  partReferenceId: z.null(),
});

export const createDeliveryNoteLineSchema = z.union([
  createPartDeliveryNoteLineSchema,
  createCustomDeliveryNoteLineSchema,
]);
export type TCreateDeliveryNoteLine = z.infer<typeof createDeliveryNoteLineSchema>;

export const updateDeliveryNoteLineSchema = baseDeliveryNoteLineSchema.extend({
  id: requiredIdSchema,
});
export type TUpdateDeliveryNoteLine = z.infer<typeof updateDeliveryNoteLineSchema>;

export const updateDeliveryNoteLinePriceSchema = z.object({
  id: requiredIdSchema,
  unitPrice: stringSchema({ nullable: false }).pipe(priceSchema),
});
export type TUpdateDeliveryNoteLinePrice = z.infer<typeof updateDeliveryNoteLinePriceSchema>;

const deliveryNoteTagGroupSchema = z.array(
  z.object({
    partQuantity: positiveQuantitySchema,
    tagQuantity: positiveQuantitySchema,
  }),
);
export type TDeliveryNoteLineTagGroup = z.infer<typeof deliveryNoteTagGroupSchema>;

const basePrintPartTagSchema = z.object({
  labelSize: tagLabelSizeSchema,
  tagGroups: deliveryNoteTagGroupSchema,
});

// A bare z.undefined() also demands that the key is present, and JSON drops keys explicitly set to
// undefined on the way to the server, so the excluded field has to allow an absent key as well.
const excludedSourceSchema = z
  .undefined("Solo se puede indicar una línea de Albarán o líneas de Pedido de venta")
  .optional();

// The staged lines of a part, in the order their units fill the tags
const printTagPartSellOrderLinesSchema = z
  .array(z.object({ id: requiredIdSchema, quantity: positiveQuantitySchema }))
  .nonempty()
  .refine(
    (lines) => new Set(lines.map((line) => line.id)).size === lines.length,
    "Una línea de Pedido de venta no se puede indicar más de una vez",
  );
export type TPrintTagPartSellOrderLines = z.infer<typeof printTagPartSellOrderLinesSchema>;

export const printTagPartSchema = z.union([
  basePrintPartTagSchema.extend({
    deliveryNoteLineId: requiredIdSchema,
    sellOrderLines: excludedSourceSchema,
  }),
  basePrintPartTagSchema.extend({
    deliveryNoteLineId: excludedSourceSchema,
    sellOrderLines: printTagPartSellOrderLinesSchema,
  }),
]);
export type TPrintTagPart = z.infer<typeof printTagPartSchema>;

export const tableRawMaterialStateSchema = tableStateSchema({ filtersSchema: nameFiltersSchema });
export type TTableRawMaterialState = z.infer<typeof tableRawMaterialStateSchema>;
