import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import MaintenanceDialog from "@/components/dialog/maintenance-dialog";
import FormPartReference from "@/form/forms/part-reference";
import useFormMode from "@/form/hooks/use-form-mode";
import usePartReferenceForm from "@/form/hooks/use-part-reference";
import { PART_REFERENCE_CREATE_TITLE, PART_REFERENCE_EDIT_TITLE } from "@/messages/part";
import type { TPartForm } from "@/queries/part";
import { FormMode } from "@/types";

interface EditPartReferenceDialogProps {
  createPartReference?: boolean;
  editingPartReference?: TPartForm["references"][number];
  editingPartId?: number;
}

export default function CreateEditPartReferenceDialog({
  createPartReference,
  editingPartReference,
  editingPartId,
}: EditPartReferenceDialogProps) {
  const navigate = useNavigate();

  const requestedFormMode = useFormMode({ create: createPartReference, edit: Boolean(editingPartReference) });

  const onClose = useCallback(
    async () =>
      navigate({
        search: (prev) => ({
          ...prev,
          createPartReference: undefined,
          editPartReferenceId: undefined,
        }),
        to: ".",
      }),
    [navigate],
  );

  const { form, formMode, validationSchema, isLoading } = usePartReferenceForm({
    controlledPartReference: editingPartReference,
    editingPartId,
    requestedFormMode,
    onSubmit: onClose,
  });

  return (
    <MaintenanceDialog
      testId="dialog-create-edit-part-reference"
      form={form}
      formMode={formMode}
      open={(createPartReference === true || editingPartReference !== undefined) && editingPartId !== undefined}
      onClose={onClose}
      isLoading={isLoading}
      validationSchema={validationSchema}
      title={
        formMode === FormMode.Create
          ? PART_REFERENCE_CREATE_TITLE
          : formMode === FormMode.Update
            ? PART_REFERENCE_EDIT_TITLE
            : undefined
      }
    >
      <FormPartReference />
    </MaintenanceDialog>
  );
}
