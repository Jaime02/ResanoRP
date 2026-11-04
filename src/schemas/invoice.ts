import { z } from "zod";

import { nullableIdSchema, requiredIdSchema, tableStateSchema } from "@/schemas";

export const invoiceSchema = z.object({
  accounted: z.boolean(),
  clientId: requiredIdSchema,
  createdAt: z.coerce.date(),
  dueDate: z.coerce.date(),
  id: requiredIdSchema,
  paymentMethodId: nullableIdSchema,
  sent: z.boolean(),
});

function isValidDateRange({ startDate, endDate }: { startDate: Date | null; endDate: Date | null }) {
  return startDate === null || endDate === null || startDate <= endDate;
}
const invalidDateRangeError = {
  error: "La fecha final no puede ser anterior a la fecha inicial",
  path: ["endDate"],
};

export const formCreateInvoiceSchema = z
  .object({
    clientId: requiredIdSchema,
    endDate: z.date().nullable(),
    startDate: z.date().nullable(),
  })
  .refine(isValidDateRange, invalidDateRangeError);
export type TFormCreateInvoice = z.infer<typeof formCreateInvoiceSchema>;

export const createInvoiceSchema = z
  .object({
    clientId: requiredIdSchema,
    endDate: z.coerce.date().nullable(),
    startDate: z.coerce.date().nullable(),
  })
  .refine(isValidDateRange, invalidDateRangeError);

const invoiceFiltersSchema = z.array(
  z.discriminatedUnion("id", [
    z.object({ id: z.literal("accounted"), value: z.boolean().nullable() }),
    z.object({ id: z.literal("clientId"), value: z.number().nullable() }),
    z.object({ id: z.literal("id"), value: z.number().nullable() }),
    z.object({ id: z.literal("sent"), value: z.boolean().nullable() }),
  ]),
);
export type TInvoiceFilters = z.infer<typeof invoiceFiltersSchema>;

export const tableInvoiceStateSchema = tableStateSchema({ filtersSchema: invoiceFiltersSchema });
export type TTableInvoiceState = z.infer<typeof tableInvoiceStateSchema>;
