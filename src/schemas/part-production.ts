import { z } from "zod";

import { quantitySchema, requiredIdSchema, dateRangeFilterSchema, tableStateSchema } from "@/schemas";

export const partProductionSchema = z.object({
  id: requiredIdSchema,
  date: z.coerce.date(),
  machineId: requiredIdSchema,
  productionOrderId: requiredIdSchema,
  quantity: quantitySchema,
});

const partProductionFiltersSchema = z.array(
  z.discriminatedUnion("id", [
    z.object({ id: z.literal("date"), value: dateRangeFilterSchema.nullable() }),
    z.object({ id: z.literal("machineId"), value: z.number().nullable() }),
    z.object({ id: z.literal("partId"), value: z.number().nullable() }),
  ]),
);
export type TPartProductionFilters = z.infer<typeof partProductionFiltersSchema>;
export const tablePartProductionStateSchema = tableStateSchema({ filtersSchema: partProductionFiltersSchema });
export type TTablePartProductionState = z.infer<typeof tablePartProductionStateSchema>;
