import { createSelectSchema } from "drizzle-orm/zod";
import { z } from "zod";

import { dbTablePaymentMethod } from "@/db/schema";
import { nameFiltersSchema, nameSchema, requiredIdObjectSchema, tableStateSchema } from "@/schemas";

const paymentDeadlineDaysSchema = z.number().int().gte(0).nullable();

const basePaymentMethodSchema = z.object({
  generatesReceipt: z.boolean(),
  name: nameSchema,
  paymentDeadlineDays: paymentDeadlineDaysSchema,
});

export const paymentMethodSchema = createSelectSchema(dbTablePaymentMethod);

export const createPaymentMethodSchema = basePaymentMethodSchema;
export type TCreatePaymentMethod = z.infer<typeof createPaymentMethodSchema>;

export const updatePaymentMethodSchema = basePaymentMethodSchema.extend(requiredIdObjectSchema.shape);
export type TUpdatePaymentMethod = z.infer<typeof updatePaymentMethodSchema>;

export const tablePaymentMethodStateSchema = tableStateSchema({ filtersSchema: nameFiltersSchema });
export type TTablePaymentMethodState = z.infer<typeof tablePaymentMethodStateSchema>;
