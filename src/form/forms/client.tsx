import { useDbClient } from "@tanstack/react-db";
import { PlusIcon } from "lucide-react";

import clientInvoiceEmailCollection from "@/collections/client-invoice-email";
import ButtonDeleteModel from "@/components/table/button-delete-model";
import NoDataRow from "@/components/table/no-data-row";
import SkeletonRow from "@/components/table/skeleton-row";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { useAppContext } from "@/contexts/app-context";
import { FormContextProvider } from "@/form";
import type useClientForm from "@/form/hooks/use-client";
import { serializeClientInvoiceEmail } from "@/lib/serializers";
import {
  ADD_INVOICE_EMAIL_PLACEHOLDER,
  CLIENT_INVOICE_EMAILS_TITLE,
  DELETE_INVOICE_EMAIL_MESSAGE,
  DELETE_INVOICE_EMAIL_TITLE,
  INVOICE_EMAIL_DELETED_MESSAGE,
  NO_INVOICE_EMAILS_MESSAGE,
} from "@/messages/client";
import { FormMode } from "@/types";
import { CLIENT_FIELD_LABELS } from "@/types/client";

interface FormClientProps extends Pick<
  ReturnType<typeof useClientForm>,
  "form" | "clientInvoiceEmailForm" | "clientInvoiceEmailFormValidationSchema" | "client" | "isLoading" | "formMode"
> {}

export default function FormClient({
  formMode,
  client,
  form,
  clientInvoiceEmailForm,
  clientInvoiceEmailFormValidationSchema,
  isLoading,
}: FormClientProps) {
  const dbClient = useDbClient();
  const { showToastOnTransaction } = useAppContext();
  const isReadOnly = formMode === FormMode.ReadOnly;

  return (
    <div className="flex flex-row flex-wrap justify-center gap-3">
      <div className="mx-auto flex w-fit flex-col items-start gap-2 sm:grid sm:grid-cols-2">
        <form.AppField
          name="name"
          children={(field) => <field.TextInput id="form-client-name" label={CLIENT_FIELD_LABELS.name} />}
        />
        <form.AppField
          name="legalName"
          children={(field) => <field.TextInput id="form-client-legal-name" label={CLIENT_FIELD_LABELS.legalName} />}
        />
        <form.AppField
          name="address"
          children={(field) => <field.TextInput id="form-client-address" label={CLIENT_FIELD_LABELS.address} />}
        />
        <form.AppField
          name="city"
          children={(field) => <field.TextInput id="form-client-city" label={CLIENT_FIELD_LABELS.city} />}
        />
        <form.AppField
          name="province"
          children={(field) => <field.TextInput id="form-client-province" label={CLIENT_FIELD_LABELS.province} />}
        />
        <form.AppField
          name="postalCode"
          children={(field) => <field.TextInput id="form-client-postal-code" label={CLIENT_FIELD_LABELS.postalCode} />}
        />
        <form.AppField
          name="country"
          children={(field) => <field.TextInput id="form-client-country" label={CLIENT_FIELD_LABELS.country} />}
        />
        <form.AppField
          name="phone"
          children={(field) => <field.TextInput id="form-client-phone" label={CLIENT_FIELD_LABELS.phone} />}
        />
        <form.AppField
          name="taxId"
          children={(field) => <field.TextInput id="form-client-tax-id" label={CLIENT_FIELD_LABELS.taxId} />}
        />
        <form.AppField
          name="iban"
          children={(field) => <field.TextInput id="form-client-iban" label={CLIENT_FIELD_LABELS.iban} />}
        />
        <form.AppField
          name="defaultPaymentMethodId"
          children={(field) => (
            <field.PaymentMethodCombobox
              id="form-client-payment-method"
              label={CLIENT_FIELD_LABELS.defaultPaymentMethodId}
              nullable
            />
          )}
        />
        <form.AppField
          name="defaultDeliveryMethodId"
          children={(field) => (
            <field.DeliveryMethodCombobox
              id="form-client-delivery-method"
              label={CLIENT_FIELD_LABELS.defaultDeliveryMethodId}
              nullable
            />
          )}
        />
        {formMode !== FormMode.Create && (
          <form.AppField
            name="prismaAccountingAccountId"
            children={(field) => (
              <field.TextInput
                id="form-client-prisma-accounting-account-id"
                label={CLIENT_FIELD_LABELS.prismaAccountingAccountId}
              />
            )}
          />
        )}
      </div>
      {formMode !== FormMode.Create && (
        <FormContextProvider
          form={clientInvoiceEmailForm}
          formMode={FormMode.Create}
          isLoading={isLoading}
          validationSchema={clientInvoiceEmailFormValidationSchema}
        >
          <Card data-testid="card-table-client-invoice-email">
            <CardHeader>
              <CardTitle>{CLIENT_INVOICE_EMAILS_TITLE}</CardTitle>
            </CardHeader>
            {!isReadOnly && (
              <div className="flex gap-2">
                <clientInvoiceEmailForm.AppField
                  name="email"
                  children={(field) => (
                    <field.TextInput
                      id="invoice-email-form-client"
                      testId="input-add-invoice-email"
                      className="w-80"
                      placeholder={ADD_INVOICE_EMAIL_PLACEHOLDER}
                    />
                  )}
                />
                <clientInvoiceEmailForm.ButtonSubmit testId="button-add-invoice-email" icon={<PlusIcon />} />
              </div>
            )}
            <Table className="w-full">
              <TableBody>
                {client?.invoiceEmails === undefined ? (
                  Array.from({ length: 3 }).map((_, index) => <SkeletonRow key={index} columns={2} />)
                ) : client.invoiceEmails.length === 0 ? (
                  <NoDataRow columns={2} message={NO_INVOICE_EMAILS_MESSAGE} />
                ) : (
                  client.invoiceEmails.map((email) => (
                    <TableRow key={email.id}>
                      <TableCell className="w-full">{email.email}</TableCell>
                      {!isReadOnly && (
                        <TableCell>
                          <ButtonDeleteModel
                            dialogTitle={DELETE_INVOICE_EMAIL_TITLE}
                            dialogDescription={DELETE_INVOICE_EMAIL_MESSAGE}
                            serializedModel={serializeClientInvoiceEmail(email, client)}
                            onConfirm={async () =>
                              showToastOnTransaction({
                                transaction: () =>
                                  dbClient.collection(clientInvoiceEmailCollection).delete(email.id, {
                                    optimistic: import.meta.env.VITE_ENV_NAME !== "test",
                                  }),
                                onSuccess: { title: INVOICE_EMAIL_DELETED_MESSAGE },
                              })
                            }
                            disabled={isLoading}
                          />
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </FormContextProvider>
      )}
    </div>
  );
}
