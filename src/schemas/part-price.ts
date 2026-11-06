import z from "zod";

import {
  dateRangeFilterSchema,
  nullableIdSchema,
  positiveQuantitySchema,
  priceSchema,
  requiredDateSchema,
  requiredIdSchema,
  tableStateSchema,
  nullableDateSchema,
} from "@/schemas";

const basePartPriceSchema = z.object({
  price: priceSchema.nullable(),
  quantity: positiveQuantitySchema.nullable(),
  createdAt: requiredDateSchema,
  clientId: nullableIdSchema,
});

export const partPriceSchema = basePartPriceSchema.extend({
  createdAt: nullableDateSchema,
  id: requiredIdSchema,
  partId: requiredIdSchema,
});

export const createPartPriceSchema = basePartPriceSchema.extend({ partId: requiredIdSchema });
export type TCreatePartPrice = z.infer<typeof createPartPriceSchema>;

export const updatePartPriceSchema = basePartPriceSchema.extend({ id: requiredIdSchema });
export type TUpdatePartPrice = z.infer<typeof updatePartPriceSchema>;

const partPriceFiltersSchema = z.array(
  z.discriminatedUnion("id", [
    z.object({ id: z.literal("clientId"), value: z.number().nullable() }),
    z.object({ id: z.literal("deletedAt"), value: z.boolean().nullable() }),
    z.object({ id: z.literal("partId"), value: z.number().nullable() }),
  ]),
);

const tablePartPriceStateSchema = tableStateSchema({ filtersSchema: partPriceFiltersSchema });
export type TTablePartPriceState = z.infer<typeof tablePartPriceStateSchema>;

const pendingPartPriceFiltersSchema = z.array(
  z.discriminatedUnion("id", [
    z.object({ id: z.literal("description"), value: z.string().nullable() }),
    z.object({ id: z.literal("quantity"), value: z.number().nullable() }),
    z.object({ id: z.literal("clientName"), value: z.string().nullable() }),
    z.object({ id: z.literal("createdAt"), value: dateRangeFilterSchema.nullable() }),
  ]),
);
export type TPendingPartPriceFilters = z.infer<typeof pendingPartPriceFiltersSchema>;

export const tablePendingPartPriceStateSchema = tableStateSchema({ filtersSchema: pendingPartPriceFiltersSchema });
export type TTablePendingPartPriceState = z.infer<typeof tablePendingPartPriceStateSchema>;
