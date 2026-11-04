import { useSelector } from "@tanstack/react-store";

import coatingCollection from "@/collections/coating";
import { useAppContext } from "@/contexts/app-context";
import { useAppForm } from "@/form";
import useResetForm from "@/form/hooks/use-reset-form";
import { COATING_CREATED_MESSAGE, COATING_EDITED_MESSAGE } from "@/messages/coating";
import { useQueryCoatingById } from "@/queries/coating";
import { createModelWithNameSchema, updateModelWithNameSchema } from "@/schemas";
import type { TCreateModelWithName, TUpdateModelWithName } from "@/schemas";
import trpc from "@/trpc/trpc-client";
import { FormMode } from "@/types";
import type { BaseCoatingSerialized } from "@/types/coating";

const defaultCoatingFormData: { name: string | null } = {
  name: null,
};

const schemas = {
  [FormMode.Create]: createModelWithNameSchema,
  [FormMode.Update]: updateModelWithNameSchema,
  [FormMode.ReadOnly]: undefined,
  [FormMode.NotApplicable]: undefined,
};

interface UseCoatingFormProps {
  requestedFormMode: FormMode;
  editCoatingId?: number;
  onSubmit?: (coating: BaseCoatingSerialized) => Promise<void>;
}

export default function useCoatingForm({ requestedFormMode, editCoatingId, onSubmit }: UseCoatingFormProps) {
  const { showToastOnTRPCMutation } = useAppContext();
  const { data: coating, isLoading: isLoadingCoating, isLoadingError, isCrashed } = useQueryCoatingById(editCoatingId);

  const formMode =
    coating?.deletedAt != null || requestedFormMode === FormMode.ReadOnly ? FormMode.ReadOnly : requestedFormMode;
  const validationSchema = schemas[formMode];

  const defaultValues = {
    ...(formMode !== FormMode.Create ? { id: coating?.id } : {}),
    name: formMode === FormMode.Create ? defaultCoatingFormData.name : (coating?.name ?? null),
  };

  const form = useAppForm({
    formId: "coating",
    defaultValues,
    onSubmit: async ({ value: coatingFormData, formApi }) => {
      if (formMode !== FormMode.Create && formMode !== FormMode.Update) return;
      const mutation =
        formMode === FormMode.Create
          ? trpc.coating.create.mutate(coatingFormData as TCreateModelWithName)
          : trpc.coating.update.mutate(coatingFormData as TUpdateModelWithName);
      await showToastOnTRPCMutation({
        mutation,
        onSuccess: { title: formMode === FormMode.Create ? COATING_CREATED_MESSAGE : COATING_EDITED_MESSAGE },
        collection: coatingCollection,
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

  const isLoading = isLoadingCoating || isSubmitting;

  return {
    coating,
    validationSchema,
    form,
    formMode,
    getCoatingByIdError:
      isLoadingError || isCrashed || (editCoatingId !== undefined && !isLoadingCoating && coating === undefined),
    isLoading,
  };
}

export type TCoatingForm = NonNullable<ReturnType<typeof useCoatingForm>["coating"]>;
