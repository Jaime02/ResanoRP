import { createSelectSchema } from "drizzle-orm/zod";
import { z } from "zod";

import { dbTableConfiguration } from "@/db/schema";
import { emailSchema, requiredIdSchema, stringSchema, vatPercentageSchema } from "@/schemas";

export const configurationSchema = createSelectSchema(dbTableConfiguration);

export const updateConfigurationSchema = z.object({
  address: stringSchema({ nullable: true }),
  bankAccount: stringSchema({ nullable: true }),
  city: stringSchema({ nullable: true }),
  email: stringSchema({ nullable: true }),
  id: requiredIdSchema,
  invoiceFootnote: stringSchema({ nullable: true }),
  invoiceSenderEmail: stringSchema({ nullable: true }).pipe(emailSchema.nullable()),
  legalName: stringSchema({ nullable: false }),
  phone: stringSchema({ nullable: true }),
  postalCode: stringSchema({ nullable: true }),
  province: stringSchema({ nullable: true }),
  taxId: stringSchema({ nullable: true }),
  vatPercentage: vatPercentageSchema,
  website: stringSchema({ nullable: true }),
});
export type TUpdateConfiguration = z.infer<typeof updateConfigurationSchema>;
