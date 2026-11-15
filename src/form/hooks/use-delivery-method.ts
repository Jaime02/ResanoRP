import { useSelector } from "@tanstack/react-store";

import { useAppContext } from "@/contexts/app-context";
import { useAppForm } from "@/form";
import useResetForm from "@/form/hooks/use-reset-form";
import { DELIVERY_METHOD_CREATED_MESSAGE, DELIVERY_METHOD_EDITED_MESSAGE } from "@/messages/delivery-method";
import { useQueryDeliveryMethodById } from "@/queries/delivery-method";
import { createModelWithNameSchema, updateModelWithNameSchema } from "@/schemas";
import type { TCreateModelWithName, TUpdateModelWithName } from "@/schemas";
import trpc from "@/trpc/trpc-client";
import { FormMode } from "@/types";
import type { BaseDeliveryMethodSerialized } from "@/types/delivery-method";

const defaultDeliveryMethodFormData: { name: string | null } = {
  name: null,
};

const schemas = {
  [FormMode.Create]: createModelWithNameSchema,
  [FormMode.Update]: updateModelWithNameSchema,
  [FormMode.ReadOnly]: undefined,
  [FormMode.NotApplicable]: undefined,
};

interface UseDeliveryMethodFormProps {
  formMode: FormMode;
  editDeliveryMethodId?: number;
  onSubmit?: (deliveryMethod: BaseDeliveryMethodSerialized) => Promise<void>;
}

export default function useDeliveryMethodForm({
  formMode,
  editDeliveryMethodId,
  onSubmit,
}: UseDeliveryMethodFormProps) {
  const { showToastOnTRPCMutation } = useAppContext();

  const {
    data: deliveryMethod,
    isLoading: isLoadingDeliveryMethod,
    isLoadingError,
    isCrashed,
  } = useQueryDeliveryMethodById(editDeliveryMethodId);

  const validationSchema = schemas[formMode];

  const defaultValues = {
    ...(formMode !== FormMode.Create ? { id: deliveryMethod?.id } : {}),
    name: formMode === FormMode.Create ? defaultDeliveryMethodFormData.name : (deliveryMethod?.name ?? null),
  };

  const form = useAppForm({
    formId: "deliveryMethod",
    defaultValues,
    onSubmit: async ({ value: deliveryMethodFormData, formApi }) => {
      if (formMode !== FormMode.Create && formMode !== FormMode.Update) return;
      const mutation =
        formMode === FormMode.Create
          ? trpc.deliveryMethod.create.mutate(deliveryMethodFormData as TCreateModelWithName)
          : trpc.deliveryMethod.update.mutate(deliveryMethodFormData as TUpdateModelWithName);
      await showToastOnTRPCMutation({
        mutation,
        onSuccess: {
          title: formMode === FormMode.Create ? DELIVERY_METHOD_CREATED_MESSAGE : DELIVERY_METHOD_EDITED_MESSAGE,
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

  const isLoading = isLoadingDeliveryMethod || isSubmitting;

  return {
    deliveryMethod,
    validationSchema,
    form,
    formMode,
    getDeliveryMethodByIdError:
      isLoadingError ||
      isCrashed ||
      (editDeliveryMethodId !== undefined && !isLoadingDeliveryMethod && deliveryMethod === undefined),
    isLoading,
  };
}

export type TDeliveryMethodForm = NonNullable<ReturnType<typeof useDeliveryMethodForm>["deliveryMethod"]>;
