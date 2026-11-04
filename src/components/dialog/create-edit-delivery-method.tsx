import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import MaintenanceDialog from "@/components/dialog/maintenance-dialog";
import DialogQueryError from "@/components/dialog/query-error";
import FormDeliveryMethod from "@/form/forms/delivery-method";
import useDeliveryMethodForm from "@/form/hooks/use-delivery-method";
import useFormMode from "@/form/hooks/use-form-mode";
import {
  DELIVERY_METHOD_CREATE_TITLE,
  DELIVERY_METHOD_EDIT_ERROR_TITLE,
  DELIVERY_METHOD_EDIT_TITLE,
  DELIVERY_METHOD_FETCH_ERROR_MESSAGE,
} from "@/messages/delivery-method";
import { FormMode } from "@/types";

interface CreateEditDeliveryMethodDialogProps {
  createDeliveryMethod?: boolean;
  editDeliveryMethodId?: number;
}

export default function CreateEditDeliveryMethodDialog({
  createDeliveryMethod,
  editDeliveryMethodId,
}: CreateEditDeliveryMethodDialogProps) {
  const navigate = useNavigate();

  const formMode = useFormMode({ create: createDeliveryMethod, edit: editDeliveryMethodId !== undefined });

  const onClose = useCallback(
    async () =>
      navigate({
        search: (prev) => ({
          ...prev,
          createDeliveryMethod: undefined,
          editDeliveryMethodId: undefined,
        }),
        to: ".",
      }),
    [navigate],
  );

  const { form, validationSchema, isLoading, getDeliveryMethodByIdError } = useDeliveryMethodForm({
    editDeliveryMethodId,
    formMode,
    onSubmit: onClose,
  });

  if (getDeliveryMethodByIdError) {
    return (
      <DialogQueryError
        testId="dialog-error-get-delivery-method-by-id-query"
        title={DELIVERY_METHOD_EDIT_ERROR_TITLE}
        errorMessage={DELIVERY_METHOD_FETCH_ERROR_MESSAGE}
        onClose={onClose}
      />
    );
  }

  return (
    <MaintenanceDialog
      testId="dialog-create-edit-delivery-method"
      open={createDeliveryMethod === true || editDeliveryMethodId !== undefined}
      form={form}
      formMode={formMode}
      validationSchema={validationSchema}
      onClose={onClose}
      isLoading={isLoading}
      title={
        formMode === FormMode.Create
          ? DELIVERY_METHOD_CREATE_TITLE
          : formMode === FormMode.Update
            ? DELIVERY_METHOD_EDIT_TITLE
            : undefined
      }
    >
      <FormDeliveryMethod />
    </MaintenanceDialog>
  );
}
