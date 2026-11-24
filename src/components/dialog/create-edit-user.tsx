import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import MaintenanceDialog from "@/components/dialog/maintenance-dialog";
import DialogQueryError from "@/components/dialog/query-error";
import FormUser from "@/form/forms/user";
import useFormMode from "@/form/hooks/use-form-mode";
import useUserForm from "@/form/hooks/use-user";
import {
  USER_CREATE_TITLE,
  USER_EDIT_ERROR_TITLE,
  USER_EDIT_TITLE,
  USER_FETCH_ERROR_MESSAGE,
} from "@/messages/backoffice";
import { FormMode } from "@/types";

interface CreateEditUserDialogProps {
  editUserId?: number;
  createUser?: boolean;
}

export default function CreateEditUserDialog({ editUserId, createUser }: CreateEditUserDialogProps) {
  const navigate = useNavigate();

  const formMode = useFormMode({ create: createUser, edit: editUserId !== undefined });

  const onClose = useCallback(
    async () =>
      navigate({
        search: (prev) => ({ ...prev, createUser: undefined, editUserId: undefined }),
        to: ".",
      }),
    [navigate],
  );

  const { form, validationSchema, isLoading, getUserByIdError } = useUserForm({
    editUserId,
    formMode,
    onSubmit: onClose,
  });

  if (getUserByIdError) {
    return (
      <DialogQueryError
        testId="dialog-error-get-user-by-id-query"
        title={USER_EDIT_ERROR_TITLE}
        errorMessage={USER_FETCH_ERROR_MESSAGE}
        onClose={onClose}
      />
    );
  }

  return (
    <MaintenanceDialog
      testId="dialog-create-edit-user"
      form={form}
      formMode={formMode}
      validationSchema={validationSchema}
      open={createUser === true || editUserId !== undefined}
      onClose={onClose}
      isLoading={isLoading}
      title={
        formMode === FormMode.Create ? USER_CREATE_TITLE : formMode === FormMode.Update ? USER_EDIT_TITLE : undefined
      }
    >
      <FormUser />
    </MaintenanceDialog>
  );
}
