import z from "zod";

import { requiredIdSchema, emailSchema } from "@/schemas";

const baseClientInvoiceEmailSchema = z.object({
  clientId: requiredIdSchema,
  email: emailSchema,
});

export const clientInvoiceEmailSchema = baseClientInvoiceEmailSchema.extend({ id: requiredIdSchema });

export const createClientInvoiceEmailSchema = baseClientInvoiceEmailSchema;
export type TCreateClientInvoiceEmail = z.infer<typeof createClientInvoiceEmailSchema>;
