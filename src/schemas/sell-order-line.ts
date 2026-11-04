import { z } from "zod";

import {
  nonZeroQuantitySchema,
  nullableIdSchema,
  priceSchema,
  quantitySchema,
  requiredIdSchema,
  stringSchema,
  tableStateSchema,
} from "@/schemas";

const baseSellOrderLineSchema = z.object({
  notes: stringSchema({ nullable: true }),
  partPrice: priceSchema.nullable().transform((partPrice) => (partPrice === "" ? null : partPrice)),
  quantity: nonZeroQuantitySchema,
  requestedDeliveryDate: z.coerce.date().nullable(),
});

// The form validates each kind of Línea with its own schema, because an error on a field it hides would block it
export const createPartSellOrderLineSchema = baseSellOrderLineSchema.extend({
  description: z.null(),
  partReferenceId: requiredIdSchema,
  sellOrderId: requiredIdSchema,
});

export const createCustomSellOrderLineSchema = baseSellOrderLineSchema.extend({
  description: stringSchema({ nullable: false }),
  partReferenceId: z.null(),
  sellOrderId: requiredIdSchema,
});

export const createSellOrderLineSchema = z.union([createPartSellOrderLineSchema, createCustomSellOrderLineSchema]);
export type TCreateSellOrderLine = z.infer<typeof createSellOrderLineSchema>;

const sellOrderLineFieldsSchema = baseSellOrderLineSchema.extend({
  id: requiredIdSchema,
  pendingQuantity: quantitySchema,
});

export const updateSellOrderLineSchema = sellOrderLineFieldsSchema.refine(
  ({ pendingQuantity, quantity }) =>
    pendingQuantity >= Math.min(quantity, 0) && pendingQuantity <= Math.max(quantity, 0),
  { message: "La cantidad pendiente debe estar entre 0 y la cantidad", path: ["pendingQuantity"] },
);
export type TUpdateSellOrderLine = z.infer<typeof updateSellOrderLineSchema>;

export const sellOrderLineSchema = sellOrderLineFieldsSchema.extend({
  description: z.string().nullable(),
  partReferenceId: nullableIdSchema,
  sellOrderId: requiredIdSchema,
  deletedAt: z.coerce.date().nullable(),
});
export type TSellOrderLine = z.infer<typeof sellOrderLineSchema>;

export enum SellOrderLineStatus {
  Completed = "COMPLETED",
  Deleted = "DELETED",
  InProduction = "IN_PRODUCTION",
  InTreatment = "IN_TREATMENT",
  Pending = "PENDING",
  PendingTreatment = "PENDING_TREATMENT",
  ProductionFinished = "PRODUCTION_FINISHED",
  ProductionPending = "PRODUCTION_PENDING",
  SellOrderDeleted = "SELL_ORDER_DELETED",
}
const sellOrderLineStatusSchema = z.enum(SellOrderLineStatus);

const sellOrderLineFiltersSchema = z.array(
  z.discriminatedUnion("id", [
    z.object({ id: z.literal("clientId"), value: z.number().nullable() }),
    z.object({ id: z.literal("clientName"), value: z.string().nullable() }),
    z.object({ id: z.literal("statuses"), value: z.array(sellOrderLineStatusSchema).nullable() }),
  ]),
);

const tableSellOrderLineStateSchema = tableStateSchema({ filtersSchema: sellOrderLineFiltersSchema });
export type TTableSellOrderLineState = z.infer<typeof tableSellOrderLineStateSchema>;
