import { useSelector } from "@tanstack/react-store";

import { useAppContext } from "@/contexts/app-context";
import { useAppForm } from "@/form";
import useResetForm from "@/form/hooks/use-reset-form";
import { CLIENT_CREATED_MESSAGE, CLIENT_EDITED_MESSAGE, CLIENT_INVOICE_EMAIL_CREATED_MESSAGE } from "@/messages/client";
import { useQueryClientById } from "@/queries/client";
import type { TCreateClient, TUpdateClient } from "@/schemas/client";
import { createClientSchema, updateClientSchema } from "@/schemas/client";
import type { TCreateClientInvoiceEmail } from "@/schemas/client-invoice-email";
import { createClientInvoiceEmailSchema } from "@/schemas/client-invoice-email";
import trpc from "@/trpc/trpc-client";
import { FormMode } from "@/types";
import type { BaseClientSerialized } from "@/types/client";

const defaultClientFormData = {
  address: null,
  city: null,
  country: null,
  defaultDeliveryMethodId: null,
  defaultPaymentMethodId: null,
  iban: null,
  legalName: null,
  name: null,
  phone: null,
  postalCode: null,
  prismaAccountingAccountId: null,
  province: null,
  taxId: null,
};

const schemas = {
  [FormMode.Create]: createClientSchema,
  [FormMode.Update]: updateClientSchema,
  [FormMode.ReadOnly]: undefined,
  [FormMode.NotApplicable]: undefined,
};

interface UseClientFormProps {
  requestedFormMode: FormMode;
  editClientId?: number;
  onSubmit?: (client: BaseClientSerialized) => Promise<void>;
}

export default function useClientForm({ requestedFormMode, editClientId, onSubmit }: UseClientFormProps) {
  const { showToastOnTRPCMutation } = useAppContext();

  const { data: client, isLoading: isLoadingClient, isLoadingError, isCrashed } = useQueryClientById(editClientId);

  const formMode =
    client?.deletedAt != null || requestedFormMode === FormMode.ReadOnly ? FormMode.ReadOnly : requestedFormMode;
  const validationSchema = schemas[formMode];

  const defaultValues = {
    ...(formMode !== FormMode.Create ? { id: client?.id } : {}),
    address: formMode === FormMode.Create ? defaultClientFormData.address : (client?.address ?? null),
    city: formMode === FormMode.Create ? defaultClientFormData.city : (client?.city ?? null),
    country: formMode === FormMode.Create ? defaultClientFormData.country : (client?.country ?? null),
    defaultDeliveryMethodId:
      formMode === FormMode.Create
        ? defaultClientFormData.defaultDeliveryMethodId
        : (client?.defaultDeliveryMethodId ?? null),
    defaultPaymentMethodId:
      formMode === FormMode.Create
        ? defaultClientFormData.defaultPaymentMethodId
        : (client?.defaultPaymentMethodId ?? null),
    iban: formMode === FormMode.Create ? defaultClientFormData.iban : (client?.iban ?? null),
    legalName: formMode === FormMode.Create ? defaultClientFormData.legalName : (client?.legalName ?? null),
    name: formMode === FormMode.Create ? defaultClientFormData.name : (client?.name ?? null),
    phone: formMode === FormMode.Create ? defaultClientFormData.phone : (client?.phone ?? null),
    postalCode: formMode === FormMode.Create ? defaultClientFormData.postalCode : (client?.postalCode ?? null),
    prismaAccountingAccountId:
      formMode === FormMode.Create
        ? defaultClientFormData.prismaAccountingAccountId
        : (client?.prismaAccountingAccountId ?? null),
    province: formMode === FormMode.Create ? defaultClientFormData.province : (client?.province ?? null),
    taxId: formMode === FormMode.Create ? defaultClientFormData.taxId : (client?.taxId ?? null),
  };

  const form = useAppForm({
    formId: "client",
    defaultValues,
    onSubmit: async ({ value: clientFormData }) => {
      if (formMode !== FormMode.Create && formMode !== FormMode.Update) return;
      const mutation =
        formMode === FormMode.Create
          ? trpc.client.create.mutate(clientFormData as TCreateClient)
          : trpc.client.update.mutate(clientFormData as TUpdateClient);
      await showToastOnTRPCMutation({
        mutation,
        onSuccess: { title: formMode === FormMode.Create ? CLIENT_CREATED_MESSAGE : CLIENT_EDITED_MESSAGE },
        onSubmit,
      });
    },
    validators: {
      onSubmit: validationSchema,
    },
  });
  const isMutatingClient = useSelector(form.store, (state) => state.isSubmitting);

  const clientInvoiceEmailForm = useAppForm({
    formId: "clientInvoiceEmail",
    defaultValues: {
      clientId: formMode === FormMode.Create ? null : (client?.id ?? null),
      email: "",
    },
    onSubmit: async ({ value: emailFormData, formApi }) => {
      if (formMode !== FormMode.Update) return;
      const mutationResult = await showToastOnTRPCMutation({
        mutation: trpc.clientInvoiceEmail.create.mutate(emailFormData as TCreateClientInvoiceEmail),
        onSuccess: {
          title: CLIENT_INVOICE_EMAIL_CREATED_MESSAGE,
        },
      });
      if (!mutationResult) return;
      formApi.reset();
    },
    validators: {
      onChange: createClientInvoiceEmailSchema,
    },
  });
  const isMutatingClientInvoiceEmail = useSelector(clientInvoiceEmailForm.store, (state) => state.isSubmitting);

  useResetForm(form, defaultValues, formMode);
  useResetForm(clientInvoiceEmailForm, client?.id, formMode);

  const isLoading = isLoadingClient || isMutatingClient || isMutatingClientInvoiceEmail;

  return {
    client,
    clientInvoiceEmailForm,
    clientInvoiceEmailFormValidationSchema: createClientInvoiceEmailSchema,
    form,
    validationSchema,
    formMode,
    isLoading,
    getClientByIdError:
      isLoadingError || isCrashed || (editClientId !== undefined && !isLoadingClient && client === undefined),
  };
}

export type TClientForm = NonNullable<ReturnType<typeof useClientForm>["client"]>;
