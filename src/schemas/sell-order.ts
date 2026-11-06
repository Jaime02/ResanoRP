import { z } from "zod";
import { zfd } from "zod-form-data";

import {
  nullableDateSchema,
  nullableIdSchema,
  requiredIdSchema,
  stringSchema,
  dateRangeFilterSchema,
  optionalFileSchema,
  requiredDateSchema,
  optionalIdSchema,
  tableStateSchema,
} from "@/schemas";

export enum SellOrderStatus {
  ClientDeleted = "CLIENT_DELETED",
  Completed = "COMPLETED",
  Deleted = "DELETED",
  Pending = "PENDING",
}
const sellOrderStatusSchema = z.enum(SellOrderStatus);

const baseSellOrderSchema = z.object({
  clientReference: stringSchema({ nullable: true }),
  notes: stringSchema({ nullable: true }),
  paymentMethodId: nullableIdSchema,
  receptionDate: z.coerce.date(),
  sellOrderFile: optionalFileSchema.optional().nullable(),
});

export const createSellOrderFormDataSchema = zfd.formData({
  clientReference: zfd.text(stringSchema({ nullable: true, optional: true })).optional(),
  notes: zfd.text(stringSchema({ nullable: true, optional: true })).optional(),
  paymentMethodId: zfd.numeric(optionalIdSchema).nullable(),
  receptionDate: requiredDateSchema,
  clientId: zfd.numeric(requiredIdSchema),
  sellOrderFile: optionalFileSchema,
});
export type TCreateSellOrder = z.infer<typeof createSellOrderFormDataSchema>;

// FormData leaves out the null values, so a missing field clears it
export const updateSellOrderFormDataSchema = zfd.formData({
  clientReference: zfd.text(stringSchema({ nullable: true }).default(null)),
  notes: zfd.text(stringSchema({ nullable: true }).default(null)),
  paymentMethodId: zfd.numeric(nullableIdSchema.default(null)),
  receptionDate: requiredDateSchema,
  id: zfd.numeric(requiredIdSchema),
  sellOrderFile: optionalFileSchema,
});
export type TUpdateSellOrder = z.infer<typeof updateSellOrderFormDataSchema>;

export const sellOrderSchema = baseSellOrderSchema.extend({
  id: requiredIdSchema,
  deletedAt: nullableDateSchema,
  fileUploadedAt: nullableDateSchema,
  clientId: requiredIdSchema,
});
export type TSellOrder = z.infer<typeof sellOrderSchema>;

const sellOrderFiltersSchema = z.array(
  z.discriminatedUnion("id", [
    z.object({ id: z.literal("clientId"), value: z.number().nullable() }),
    z.object({ id: z.literal("clientName"), value: z.string().nullable() }),
    z.object({ id: z.literal("id"), value: z.number().nullable() }),
    z.object({ id: z.literal("partId"), value: z.number().nullable() }),
    z.object({ id: z.literal("receptionDate"), value: dateRangeFilterSchema.nullable() }),
    z.object({ id: z.literal("statuses"), value: z.array(sellOrderStatusSchema).nullable() }),
  ]),
);
export type TSellOrderFilters = z.infer<typeof sellOrderFiltersSchema>;

export const tableSellOrderStateSchema = tableStateSchema({ filtersSchema: sellOrderFiltersSchema });
export type TTableSellOrderState = z.infer<typeof tableSellOrderStateSchema>;
