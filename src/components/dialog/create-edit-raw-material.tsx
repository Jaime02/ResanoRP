import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import MaintenanceDialog from "@/components/dialog/maintenance-dialog";
import DialogQueryError from "@/components/dialog/query-error";
import FormRawMaterial from "@/form/forms/raw-material";
import useFormMode from "@/form/hooks/use-form-mode";
import useRawMaterialForm from "@/form/hooks/use-raw-material";
import {
  RAW_MATERIAL_CREATE_TITLE,
  RAW_MATERIAL_EDIT_ERROR_TITLE,
  RAW_MATERIAL_EDIT_TITLE,
  RAW_MATERIAL_FETCH_ERROR_MESSAGE,
} from "@/messages/material";
import { FormMode } from "@/types";

interface CreateEditRawMaterialDialogProps {
  createRawMaterial?: boolean;
  editRawMaterialId?: number;
}

export default function CreateEditRawMaterialDialog({
  createRawMaterial,
  editRawMaterialId,
}: CreateEditRawMaterialDialogProps) {
  const navigate = useNavigate();

  const requestedFormMode = useFormMode({ create: createRawMaterial, edit: editRawMaterialId !== undefined });

  const onClose = useCallback(async () => {
    await navigate({
      search: (prev) => ({
        ...prev,
        createRawMaterial: undefined,
        editRawMaterialId: undefined,
      }),
      to: ".",
    });
  }, [navigate]);

  const { form, formMode, validationSchema, isLoading, getRawMaterialByIdError } = useRawMaterialForm({
    editRawMaterialId,
    requestedFormMode,
    onSubmit: onClose,
  });

  if (getRawMaterialByIdError) {
    return (
      <DialogQueryError
        testId="dialog-error-get-raw-material-by-id-query"
        title={RAW_MATERIAL_EDIT_ERROR_TITLE}
        errorMessage={RAW_MATERIAL_FETCH_ERROR_MESSAGE}
        onClose={onClose}
      />
    );
  }

  return (
    <MaintenanceDialog
      testId="dialog-create-edit-raw-material"
      open={createRawMaterial === true || editRawMaterialId !== undefined}
      form={form}
      formMode={formMode}
      validationSchema={validationSchema}
      onClose={onClose}
      isLoading={isLoading}
      title={
        formMode === FormMode.Create
          ? RAW_MATERIAL_CREATE_TITLE
          : formMode === FormMode.Update
            ? RAW_MATERIAL_EDIT_TITLE
            : undefined
      }
    >
      <FormRawMaterial />
    </MaintenanceDialog>
  );
}
