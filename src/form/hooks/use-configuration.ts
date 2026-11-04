import { useSelector } from "@tanstack/react-store";

import configurationCollection from "@/collections/configuration";
import { useAppContext } from "@/contexts/app-context";
import { useAppForm } from "@/form";
import useResetForm from "@/form/hooks/use-reset-form";
import { CONFIGURATION_EDITED_MESSAGE } from "@/messages/configuration";
import { useQueryConfiguration } from "@/queries/configuration";
import { updateConfigurationSchema } from "@/schemas/configuration";
import type { TUpdateConfiguration } from "@/schemas/configuration";
import trpc from "@/trpc/trpc-client";
import { FormMode } from "@/types";

interface UseConfigurationFormProps {
  formMode: FormMode;
}

export default function useConfigurationForm({ formMode }: UseConfigurationFormProps) {
  const { showToastOnTRPCMutation } = useAppContext();

  const { data: configuration, isLoading: isLoadingConfiguration, isLoadingError, isCrashed } = useQueryConfiguration();

  const validationSchema = formMode === FormMode.Update ? updateConfigurationSchema : undefined;

  const defaultValues = {
    address: configuration?.address ?? null,
    bankAccount: configuration?.bankAccount ?? null,
    city: configuration?.city ?? null,
    email: configuration?.email ?? null,
    id: configuration?.id ?? null,
    invoiceFootnote: configuration?.invoiceFootnote ?? null,
    invoiceSenderEmail: configuration?.invoiceSenderEmail ?? null,
    legalName: configuration?.legalName ?? null,
    phone: configuration?.phone ?? null,
    postalCode: configuration?.postalCode ?? null,
    province: configuration?.province ?? null,
    taxId: configuration?.taxId ?? null,
    vatPercentage: configuration?.vatPercentage ?? null,
    website: configuration?.website ?? null,
  };

  const form = useAppForm({
    formId: "configuration",
    defaultValues,
    onSubmit: async ({ value: configurationFormData, formApi }) => {
      if (formMode !== FormMode.Update) return;
      if (formApi.state.isDefaultValue) return;

      await showToastOnTRPCMutation({
        mutation: trpc.configuration.update.mutate(configurationFormData as TUpdateConfiguration),
        onSuccess: { title: CONFIGURATION_EDITED_MESSAGE },
        collection: configurationCollection,
      });
    },
    validators: {
      onSubmit: validationSchema,
    },
  });

  const isSubmitting = useSelector(form.store, (state) => state.isSubmitting);

  useResetForm(form, defaultValues, formMode);

  return {
    configuration,
    validationSchema,
    form,
    formMode,
    getConfigurationError: isLoadingError || isCrashed || (!isLoadingConfiguration && configuration === undefined),
    isLoading: isLoadingConfiguration || isSubmitting,
  };
}
