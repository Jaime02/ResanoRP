import { z } from "zod";

import {
  nameSchema,
  nullableDateSchema,
  nullableIdSchema,
  requiredIdSchema,
  stringSchema,
  tableStateSchema,
} from "@/schemas";

const baseClientSchema = z.object({
  address: stringSchema({ nullable: false }),
  city: stringSchema({ nullable: false }),
  country: stringSchema({ nullable: true }),
  defaultDeliveryMethodId: nullableIdSchema,
  defaultPaymentMethodId: nullableIdSchema,
  iban: stringSchema({ nullable: true }),
  legalName: stringSchema({ nullable: false }),
  name: nameSchema,
  phone: stringSchema({ nullable: true }),
  postalCode: stringSchema({ nullable: false }).regex(/^[0-9]+$/, "El campo solo puede contener dígitos"),
  // The account of the Cliente in Prisma, the accounting program, which is not
  // derived from its ID. The exported invoices write it in a 9 characters field
  prismaAccountingAccountId: z
    .string()
    .regex(/^(430[0-9]{0,6})?$/, "Debe empezar por 430 y tener como máximo 9 dígitos")
    .nullable()
    .transform((value) => (value === "" ? null : value)),
  province: stringSchema({ nullable: true }),
  taxId: stringSchema({ nullable: false }),
});

export const clientSchema = baseClientSchema.extend({
  id: requiredIdSchema,
  deletedAt: nullableDateSchema,
});

export const createClientSchema = baseClientSchema;
export type TCreateClient = z.infer<typeof createClientSchema>;

export const updateClientSchema = baseClientSchema.extend({
  id: requiredIdSchema,
});
export type TUpdateClient = z.infer<typeof updateClientSchema>;

const clientFiltersSchema = z.array(
  z.discriminatedUnion("id", [
    z.object({ id: z.literal("city"), value: z.string().nullable() }),
    z.object({ id: z.literal("deletedAt"), value: z.boolean().nullable() }),
    z.object({ id: z.literal("invoiceEmail"), value: z.string().nullable() }),
    z.object({ id: z.literal("name"), value: z.string().nullable() }),
    z.object({ id: z.literal("phone"), value: z.string().nullable() }),
    z.object({ id: z.literal("taxId"), value: z.string().nullable() }),
  ]),
);
export type TClientFilters = z.infer<typeof clientFiltersSchema>;

export const tableClientStateSchema = tableStateSchema({ filtersSchema: clientFiltersSchema });
export type TTableClientState = z.infer<typeof tableClientStateSchema>;
