import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import MaintenanceDialog from "@/components/dialog/maintenance-dialog";
import DialogQueryError from "@/components/dialog/query-error";
import FormCoating from "@/form/forms/coating";
import useCoatingForm from "@/form/hooks/use-coating";
import useFormMode from "@/form/hooks/use-form-mode";
import {
  COATING_CREATE_TITLE,
  COATING_EDIT_ERROR_TITLE,
  COATING_EDIT_TITLE,
  COATING_FETCH_ERROR_MESSAGE,
} from "@/messages/coating";
import { FormMode } from "@/types";

interface CreateEditCoatingDialogProps {
  createCoating?: boolean;
  editCoatingId?: number;
}

export default function CreateEditCoatingDialog({ createCoating, editCoatingId }: CreateEditCoatingDialogProps) {
  const navigate = useNavigate();

  const requestedFormMode = useFormMode({ create: createCoating, edit: editCoatingId !== undefined });

  const onClose = useCallback(
    async () =>
      navigate({
        search: (prev) => ({ ...prev, createCoating: undefined, editCoatingId: undefined }),
        to: ".",
      }),
    [navigate],
  );

  const { form, validationSchema, isLoading, formMode, getCoatingByIdError } = useCoatingForm({
    editCoatingId,
    requestedFormMode,
    onSubmit: onClose,
  });

  if (getCoatingByIdError) {
    return (
      <DialogQueryError
        testId="dialog-error-get-coating-by-id-query"
        title={COATING_EDIT_ERROR_TITLE}
        errorMessage={COATING_FETCH_ERROR_MESSAGE}
        onClose={onClose}
      />
    );
  }

  return (
    <MaintenanceDialog
      testId="dialog-create-edit-coating"
      open={createCoating === true || editCoatingId !== undefined}
      form={form}
      formMode={formMode}
      validationSchema={validationSchema}
      onClose={onClose}
      isLoading={isLoading}
      title={
        formMode === FormMode.Create
          ? COATING_CREATE_TITLE
          : formMode === FormMode.Update
            ? COATING_EDIT_TITLE
            : undefined
      }
    >
      <FormCoating />
    </MaintenanceDialog>
  );
}
