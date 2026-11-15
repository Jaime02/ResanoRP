import { useSelector } from "@tanstack/react-store";

import { useAppContext } from "@/contexts/app-context";
import { useAppForm } from "@/form";
import useResetForm from "@/form/hooks/use-reset-form";
import { PAYMENT_METHOD_CREATED_MESSAGE, PAYMENT_METHOD_EDITED_MESSAGE } from "@/messages/payment-method";
import { useQueryPaymentMethodById } from "@/queries/payment-method";
import { createPaymentMethodSchema, updatePaymentMethodSchema } from "@/schemas/payment-method";
import type { TCreatePaymentMethod, TUpdatePaymentMethod } from "@/schemas/payment-method";
import trpc from "@/trpc/trpc-client";
import { FormMode } from "@/types";
import type { BasePaymentMethodSerialized } from "@/types/payment-method";

const defaultPaymentMethodFormData = {
  generatesReceipt: false,
  name: null,
  paymentDeadlineDays: 0,
};

interface UsePaymentMethodFormProps {
  formMode?: FormMode;
  editPaymentMethodId?: number;
  onSubmit?: (paymentMethod: BasePaymentMethodSerialized) => Promise<void>;
}

export default function usePaymentMethodForm({ formMode, editPaymentMethodId, onSubmit }: UsePaymentMethodFormProps) {
  const { showToastOnTRPCMutation } = useAppContext();

  const {
    data: paymentMethod,
    isLoading: isLoadingPaymentMethod,
    isLoadingError,
    isCrashed,
  } = useQueryPaymentMethodById(editPaymentMethodId);

  const validationSchema = formMode === FormMode.Create ? createPaymentMethodSchema : updatePaymentMethodSchema;

  const defaultValues = {
    ...(formMode !== FormMode.Create ? { id: paymentMethod?.id } : {}),
    generatesReceipt:
      formMode === FormMode.Create
        ? defaultPaymentMethodFormData.generatesReceipt
        : (paymentMethod?.generatesReceipt ?? defaultPaymentMethodFormData.generatesReceipt),
    name: formMode === FormMode.Create ? defaultPaymentMethodFormData.name : paymentMethod?.name,
    paymentDeadlineDays:
      formMode === FormMode.Create
        ? defaultPaymentMethodFormData.paymentDeadlineDays
        : paymentMethod?.paymentDeadlineDays,
  };

  const form = useAppForm({
    formId: "paymentMethod",
    defaultValues,
    onSubmit: async ({ value: paymentMethodFormData }) => {
      if (formMode !== FormMode.Create && formMode !== FormMode.Update) return;
      const mutation =
        formMode === FormMode.Create
          ? trpc.paymentMethod.create.mutate(paymentMethodFormData as TCreatePaymentMethod)
          : trpc.paymentMethod.update.mutate(paymentMethodFormData as TUpdatePaymentMethod);
      await showToastOnTRPCMutation({
        mutation,
        onSuccess: {
          title: formMode === FormMode.Create ? PAYMENT_METHOD_CREATED_MESSAGE : PAYMENT_METHOD_EDITED_MESSAGE,
        },
        onSubmit,
      });
    },
    validators: {
      onSubmit: validationSchema,
    },
  });

  useResetForm(form, defaultValues, formMode);

  const isSubmitting = useSelector(form.store, (state) => state.isSubmitting);
  const isLoading = (formMode !== FormMode.Create && isLoadingPaymentMethod) || isSubmitting;

  return {
    validationSchema,
    form,
    getPaymentMethodByIdError:
      isLoadingError ||
      isCrashed ||
      (editPaymentMethodId !== undefined && !isLoadingPaymentMethod && paymentMethod === undefined),
    isLoading,
    paymentMethod,
  };
}

export type TPaymentMethodForm = NonNullable<ReturnType<typeof usePaymentMethodForm>["paymentMethod"]>;
