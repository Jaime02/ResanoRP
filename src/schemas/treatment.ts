import { z } from "zod";

import { nameFiltersSchema, positiveQuantitySchema, requiredIdSchema, tableStateSchema } from "@/schemas";

export const treatmentShipmentSchema = z.object({
  id: requiredIdSchema,
  partId: requiredIdSchema,
  productionOrderId: requiredIdSchema.nullable(),
  quantity: positiveQuantitySchema,
  sentAt: z.coerce.date(),
});

export const treatmentReceptionSchema = z.object({
  id: requiredIdSchema,
  quantity: positiveQuantitySchema,
  receivedAt: z.coerce.date(),
  treatmentShipmentId: requiredIdSchema,
});

const uniqueBy = <T>(items: Array<T>, key: (item: T) => number) => new Set(items.map(key)).size === items.length;

export const sendTreatmentSchema = z
  .array(z.object({ productionOrderId: requiredIdSchema, quantity: positiveQuantitySchema }))
  .min(1, "Introduce la cantidad a enviar de alguna Orden de producción")
  .refine((items) => uniqueBy(items, (item) => item.productionOrderId), "Cada Orden de producción se envía una vez");

export const sendPartTreatmentSchema = z.object({ partId: requiredIdSchema, quantity: positiveQuantitySchema });
export type TSendPartTreatment = z.infer<typeof sendPartTreatmentSchema>;

export const receiveTreatmentSchema = z
  .array(z.object({ quantity: positiveQuantitySchema, treatmentShipmentId: requiredIdSchema }))
  .min(1, "Introduce la cantidad a recibir de algún envío")
  .refine((items) => uniqueBy(items, (item) => item.treatmentShipmentId), "Cada envío se recibe una vez");

export const tableTreatmentPendingStateSchema = tableStateSchema({ filtersSchema: nameFiltersSchema });
export type TTableTreatmentPendingState = z.infer<typeof tableTreatmentPendingStateSchema>;
