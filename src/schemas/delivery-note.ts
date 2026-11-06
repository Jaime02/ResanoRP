import { z } from "zod";

import {
  nullableIdSchema,
  nonZeroQuantitySchema,
  requiredDateSchema,
  requiredIdSchema,
  tableStateSchema,
  nullableDateSchema,
} from "@/schemas";

const baseDeliveryNoteSchema = z.object({
  deliveryDate: requiredDateSchema,
  deliveryMethodId: nullableIdSchema,
});
const deliveryNoteCreateFieldsSchema = z.object({
  clientId: requiredIdSchema,
});
const deliveryNoteUpdateFieldsSchema = z.object({
  id: requiredIdSchema,
});

export const deliveryNoteSchema = baseDeliveryNoteSchema
  .extend(deliveryNoteUpdateFieldsSchema.shape)
  .extend(deliveryNoteCreateFieldsSchema.shape)
  .extend({
    deliveryDate: nullableDateSchema,
    invoiceId: nullableIdSchema,
    createdAt: z.coerce.date(),
  });

export const createDeliveryNoteSchema = baseDeliveryNoteSchema.extend(deliveryNoteCreateFieldsSchema.shape);
export type TCreateDeliveryNote = z.infer<typeof createDeliveryNoteSchema>;

export const updateDeliveryNoteSchema = baseDeliveryNoteSchema.extend(deliveryNoteUpdateFieldsSchema.shape);
export type TUpdateDeliveryNote = z.infer<typeof updateDeliveryNoteSchema>;

const createDeliveryNoteLineSchema = z.object({
  id: requiredIdSchema,
  quantity: nonZeroQuantitySchema,
});

const stagedSellOrderLinesSchema = z.array(createDeliveryNoteLineSchema).nonempty();
export type TStagedSellOrderLine = z.infer<typeof createDeliveryNoteLineSchema>;

export const createDeliveryNoteWithLinesSchema = z.object({
  clientId: requiredIdSchema,
  deliveryMethodId: nullableIdSchema,
  stagedSellOrderLines: stagedSellOrderLinesSchema,
});
export type TCreateDeliveryNoteWithLines = z.infer<typeof createDeliveryNoteWithLinesSchema>;

export const appendLinesToDeliveryNoteSchema = z.object({
  deliveryNoteId: requiredIdSchema,
  stagedSellOrderLines: stagedSellOrderLinesSchema,
});
export type TAppendLinesToDeliveryNote = z.infer<typeof appendLinesToDeliveryNoteSchema>;

export const printDeliveryNoteSchema = z.object({
  copies: z.number().int().positive().max(2).default(1),
  id: requiredIdSchema,
  withPrices: z.boolean(),
});

const deliveryNoteFiltersSchema = z.array(
  z.discriminatedUnion("id", [
    z.object({ id: z.literal("clientId"), value: z.number().nullable() }),
    z.object({ id: z.literal("id"), value: z.number().nullable() }),
    z.object({ id: z.literal("partId"), value: z.number().nullable() }),
  ]),
);
export type TDeliveryNoteFilters = z.infer<typeof deliveryNoteFiltersSchema>;

export const tableDeliveryNoteStateSchema = tableStateSchema({
  filtersSchema: deliveryNoteFiltersSchema,
});
export type TTableDeliveryNoteState = z.infer<typeof tableDeliveryNoteStateSchema>;
