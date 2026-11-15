import { useSelector } from "@tanstack/react-store";

import { useAppContext } from "@/contexts/app-context";
import { useAppForm } from "@/form";
import useResetForm from "@/form/hooks/use-reset-form";
import { PART_REFERENCE_CREATED_MESSAGE, PART_REFERENCE_EDITED_MESSAGE } from "@/messages/part";
import type { TCreatePartReference, TUpdatePartReference } from "@/schemas/part-reference";
import { createPartReferenceSchema, updatePartReferenceSchema } from "@/schemas/part-reference";
import trpc from "@/trpc/trpc-client";
import { FormMode } from "@/types";
import type { BasePartReference, BasePartReferenceSerialized } from "@/types/part-reference";

const defaultPartReferenceFormData: {
  clientDescription: string | null;
  clientId: number | null;
  reference: string | null;
} = {
  clientDescription: null,
  clientId: null,
  reference: null,
};

const schemas = {
  [FormMode.Create]: createPartReferenceSchema,
  [FormMode.Update]: updatePartReferenceSchema,
  [FormMode.ReadOnly]: undefined,
  [FormMode.NotApplicable]: undefined,
};

interface UsePartReferenceFormProps {
  requestedFormMode: FormMode;
  editingPartId?: number;
  controlledPartReference?: BasePartReference;
  onSubmit?: (partReference: BasePartReferenceSerialized) => Promise<void>;
}

export default function usePartReferenceForm({
  requestedFormMode,
  editingPartId,
  controlledPartReference,
  onSubmit,
}: UsePartReferenceFormProps) {
  const { showToastOnTRPCMutation } = useAppContext();

  const formMode =
    controlledPartReference?.deletedAt != null || requestedFormMode === FormMode.ReadOnly
      ? FormMode.ReadOnly
      : requestedFormMode;
  const validationSchema = schemas[formMode];

  const defaultValues = {
    ...(formMode !== FormMode.Create ? { id: controlledPartReference?.id } : {}),
    ...(formMode === FormMode.Create ? { partId: editingPartId } : {}),
    clientDescription:
      formMode === FormMode.Create
        ? defaultPartReferenceFormData.clientDescription
        : (controlledPartReference?.clientDescription ?? null),
    clientId:
      formMode === FormMode.Create
        ? defaultPartReferenceFormData.clientId
        : (controlledPartReference?.clientId ?? null),
    reference:
      formMode === FormMode.Create
        ? defaultPartReferenceFormData.reference
        : (controlledPartReference?.reference ?? null),
  };

  const form = useAppForm({
    formId: "partReference",
    defaultValues,
    onSubmit: async ({ value: partReferenceFormData, formApi }) => {
      if (formMode !== FormMode.Create && formMode !== FormMode.Update) return;
      const mutation =
        formMode === FormMode.Create
          ? trpc.partReference.create.mutate(partReferenceFormData as TCreatePartReference)
          : trpc.partReference.update.mutate(partReferenceFormData as TUpdatePartReference);
      await showToastOnTRPCMutation({
        mutation,
        onSuccess: {
          title: formMode === FormMode.Create ? PART_REFERENCE_CREATED_MESSAGE : PART_REFERENCE_EDITED_MESSAGE,
        },
        onSubmit: async (item) => {
          await onSubmit?.(item);
          if (formMode === FormMode.Create) formApi.reset();
        },
      });
    },
    validators: {
      onSubmit: validationSchema,
    },
  });

  const isSubmitting = useSelector(form.store, (state) => state.isSubmitting);

  useResetForm(form, defaultValues, formMode);

  const isLoading = isSubmitting;

  return {
    validationSchema,
    form,
    formMode,
    isLoading,
    partReference: controlledPartReference,
  };
}
