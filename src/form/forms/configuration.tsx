import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { useFormContext } from "@/form";
import { PHONE_LABEL } from "@/messages/client";
import {
  ADDRESS_LABEL,
  CITY_LABEL,
  EMAIL_LABEL,
  LEGAL_NAME_LABEL,
  POSTAL_CODE_LABEL,
  PROVINCE_LABEL,
  TAX_ID_LABEL,
} from "@/messages/common";
import {
  BANK_ACCOUNT_LABEL,
  COMPANY_TITLE,
  INVOICE_FOOTNOTE_LABEL,
  INVOICE_SENDER_EMAIL_LABEL,
  VAT_PERCENTAGE_LABEL,
  CONFIGURATION_EDIT_TITLE,
  WEBSITE_LABEL,
} from "@/messages/configuration";
import { INVOICING_LABEL } from "@/messages/invoice";
import { FormMode } from "@/types";
import type { TFormFieldLabel } from "@/types";
import type { BaseConfiguration } from "@/types/configuration";

const CONFIGURATION_FIELD_LABELS = {
  legalName: LEGAL_NAME_LABEL,
  taxId: TAX_ID_LABEL,
  address: ADDRESS_LABEL,
  postalCode: POSTAL_CODE_LABEL,
  city: CITY_LABEL,
  province: PROVINCE_LABEL,
  phone: PHONE_LABEL,
  email: EMAIL_LABEL,
  website: WEBSITE_LABEL,
  vatPercentage: VAT_PERCENTAGE_LABEL,
  bankAccount: BANK_ACCOUNT_LABEL,
  invoiceSenderEmail: INVOICE_SENDER_EMAIL_LABEL,
  invoiceFootnote: INVOICE_FOOTNOTE_LABEL,
} as const satisfies TFormFieldLabel<BaseConfiguration>;

export default function FormConfiguration() {
  const { form, formMode } = useFormContext();

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{COMPANY_TITLE}</CardTitle>
        </CardHeader>
        <div className="flex flex-col items-start gap-2 sm:grid sm:grid-cols-2">
          <form.AppField
            name="legalName"
            children={(field) => (
              <field.TextInput id="form-configuration-legal-name" label={CONFIGURATION_FIELD_LABELS.legalName} />
            )}
          />
          <form.AppField
            name="taxId"
            children={(field) => (
              <field.TextInput id="form-configuration-tax-id" label={CONFIGURATION_FIELD_LABELS.taxId} />
            )}
          />
          <form.AppField
            name="address"
            children={(field) => (
              <field.TextInput id="form-configuration-address" label={CONFIGURATION_FIELD_LABELS.address} />
            )}
          />
          <form.AppField
            name="postalCode"
            children={(field) => (
              <field.TextInput id="form-configuration-postal-code" label={CONFIGURATION_FIELD_LABELS.postalCode} />
            )}
          />
          <form.AppField
            name="city"
            children={(field) => (
              <field.TextInput id="form-configuration-city" label={CONFIGURATION_FIELD_LABELS.city} />
            )}
          />
          <form.AppField
            name="province"
            children={(field) => (
              <field.TextInput id="form-configuration-province" label={CONFIGURATION_FIELD_LABELS.province} />
            )}
          />
          <form.AppField
            name="phone"
            children={(field) => (
              <field.TextInput id="form-configuration-phone" label={CONFIGURATION_FIELD_LABELS.phone} />
            )}
          />
          <form.AppField
            name="email"
            children={(field) => (
              <field.TextInput id="form-configuration-email" label={CONFIGURATION_FIELD_LABELS.email} />
            )}
          />
          <form.AppField
            name="website"
            children={(field) => (
              <field.TextInput id="form-configuration-website" label={CONFIGURATION_FIELD_LABELS.website} />
            )}
          />
        </div>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{INVOICING_LABEL}</CardTitle>
        </CardHeader>
        <div className="flex flex-col items-start gap-2 sm:grid sm:grid-cols-2">
          <form.AppField
            name="vatPercentage"
            children={(field) => (
              <field.NumberInput
                id="form-configuration-vat-percentage"
                label={CONFIGURATION_FIELD_LABELS.vatPercentage}
              />
            )}
          />
          <form.AppField
            name="bankAccount"
            children={(field) => (
              <field.TextInput id="form-configuration-bank-account" label={CONFIGURATION_FIELD_LABELS.bankAccount} />
            )}
          />
          <form.AppField
            name="invoiceSenderEmail"
            children={(field) => (
              <field.TextInput
                id="form-configuration-invoice-sender-email"
                label={CONFIGURATION_FIELD_LABELS.invoiceSenderEmail}
              />
            )}
          />
          <form.AppField
            name="invoiceFootnote"
            children={(field) => (
              <field.TextareaInput
                id="form-configuration-invoice-footnote"
                label={CONFIGURATION_FIELD_LABELS.invoiceFootnote}
                layoutClassName="col-span-2"
                className="w-full"
              />
            )}
          />
        </div>
      </Card>
      {formMode !== FormMode.ReadOnly && (
        <form.ButtonSubmit className="self-end" customText={CONFIGURATION_EDIT_TITLE} />
      )}
    </>
  );
}
