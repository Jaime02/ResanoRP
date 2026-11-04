import { createSelectSchema } from "drizzle-orm/zod";
import { z } from "zod";

import { dbTableConfiguration } from "@/db/schema";
import { emailSchema, requiredIdSchema, stringSchema, vatPercentageSchema } from "@/schemas";

export const configurationSchema = createSelectSchema(dbTableConfiguration);

export const updateConfigurationSchema = z.object({
  address: stringSchema().nullable(),
  bankAccount: stringSchema().nullable(),
  city: stringSchema().nullable(),
  email: stringSchema().nullable(),
  id: requiredIdSchema,
  invoiceFootnote: stringSchema().nullable(),
  invoiceSenderEmail: stringSchema().nullable().pipe(emailSchema.nullable()),
  legalName: stringSchema({ nullable: false }),
  phone: stringSchema().nullable(),
  postalCode: stringSchema().nullable(),
  province: stringSchema().nullable(),
  taxId: stringSchema().nullable(),
  vatPercentage: vatPercentageSchema,
  website: stringSchema().nullable(),
});
export type TUpdateConfiguration = z.infer<typeof updateConfigurationSchema>;
