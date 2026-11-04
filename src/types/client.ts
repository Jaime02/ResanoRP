import type { InferSelectModel } from "drizzle-orm";

import type { dbTableClient } from "@/db/schema";
import {
  COUNTRY_LABEL,
  DEFAULT_DELIVERY_METHOD_LABEL,
  DEFAULT_PAYMENT_METHOD_LABEL,
  IBAN_LABEL,
  PHONE_LABEL,
  PRISMA_ACCOUNTING_ACCOUNT_LABEL,
} from "@/messages/client";
import {
  ADDRESS_LABEL,
  CITY_LABEL,
  LEGAL_NAME_LABEL,
  NAME_LABEL,
  POSTAL_CODE_LABEL,
  PROVINCE_LABEL,
  TAX_ID_LABEL,
} from "@/messages/common";
import type { SerializeDateFields, TFormFieldLabel } from "@/types";

export type BaseClient = InferSelectModel<typeof dbTableClient>;
export type BaseClientSerialized = SerializeDateFields<BaseClient>;

export const CLIENT_FIELD_LABELS = {
  name: NAME_LABEL,
  legalName: LEGAL_NAME_LABEL,
  address: ADDRESS_LABEL,
  city: CITY_LABEL,
  province: PROVINCE_LABEL,
  postalCode: POSTAL_CODE_LABEL,
  country: COUNTRY_LABEL,
  phone: PHONE_LABEL,
  taxId: TAX_ID_LABEL,
  iban: IBAN_LABEL,
  defaultPaymentMethodId: DEFAULT_PAYMENT_METHOD_LABEL,
  defaultDeliveryMethodId: DEFAULT_DELIVERY_METHOD_LABEL,
  prismaAccountingAccountId: PRISMA_ACCOUNTING_ACCOUNT_LABEL,
} as const satisfies TFormFieldLabel<BaseClient>;
