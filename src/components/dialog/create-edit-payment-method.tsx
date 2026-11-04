import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import MaintenanceDialog from "@/components/dialog/maintenance-dialog";
import DialogQueryError from "@/components/dialog/query-error";
import FormPaymentMethod from "@/form/forms/payment-method";
import useFormMode from "@/form/hooks/use-form-mode";
import usePaymentMethodForm from "@/form/hooks/use-payment-method";
import {
  PAYMENT_METHOD_CREATE_TITLE,
  PAYMENT_METHOD_EDIT_ERROR_TITLE,
  PAYMENT_METHOD_EDIT_TITLE,
  PAYMENT_METHOD_FETCH_ERROR_MESSAGE,
} from "@/messages/payment-method";
import { FormMode } from "@/types";

interface CreateEditPaymentMethodDialogProps {
  editPaymentMethodId?: number;
  createPaymentMethod?: boolean;
}

export default function CreateEditPaymentMethodDialog({
  editPaymentMethodId,
  createPaymentMethod,
}: CreateEditPaymentMethodDialogProps) {
  const navigate = useNavigate();

  const formMode = useFormMode({ create: createPaymentMethod, edit: editPaymentMethodId !== undefined });

  const onClose = useCallback(
    async () =>
      navigate({
        search: (prev) => ({
          ...prev,
          createPaymentMethod: undefined,
          editPaymentMethodId: undefined,
        }),
        to: ".",
      }),
    [navigate],
  );

  const { form, validationSchema, isLoading, getPaymentMethodByIdError } = usePaymentMethodForm({
    editPaymentMethodId,
    formMode,
    onSubmit: onClose,
  });

  if (getPaymentMethodByIdError) {
    return (
      <DialogQueryError
        testId="dialog-error-get-payment-method-by-id-query"
        title={PAYMENT_METHOD_EDIT_ERROR_TITLE}
        errorMessage={PAYMENT_METHOD_FETCH_ERROR_MESSAGE}
        onClose={onClose}
      />
    );
  }

  return (
    <MaintenanceDialog
      testId="dialog-create-edit-payment-method"
      form={form}
      formMode={formMode}
      validationSchema={validationSchema}
      open={createPaymentMethod === true || editPaymentMethodId !== undefined}
      onClose={onClose}
      isLoading={isLoading}
      title={
        formMode === FormMode.Create
          ? PAYMENT_METHOD_CREATE_TITLE
          : formMode === FormMode.Update
            ? PAYMENT_METHOD_EDIT_TITLE
            : undefined
      }
    >
      <FormPaymentMethod />
    </MaintenanceDialog>
  );
}
