import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import MaintenanceDialog from "@/components/dialog/maintenance-dialog";
import DialogQueryError from "@/components/dialog/query-error";
import FormPrinter from "@/form/forms/printer";
import useFormMode from "@/form/hooks/use-form-mode";
import usePrinterForm from "@/form/hooks/use-printer";
import {
  PRINTER_CREATE_TITLE,
  PRINTER_EDIT_ERROR_TITLE,
  PRINTER_EDIT_TITLE,
  PRINTER_FETCH_ERROR_MESSAGE,
} from "@/messages/printer";
import { FormMode } from "@/types";

interface CreateEditPrinterDialogProps {
  createPrinter?: boolean;
  editPrinterId?: number;
}

export default function CreateEditPrinterDialog({ createPrinter, editPrinterId }: CreateEditPrinterDialogProps) {
  const navigate = useNavigate();

  const formMode = useFormMode({ create: createPrinter, edit: editPrinterId !== undefined });

  const onClose = useCallback(
    async () =>
      navigate({
        search: (prev) => ({
          ...prev,
          createPrinter: undefined,
          editPrinterId: undefined,
        }),
        to: ".",
      }),
    [navigate],
  );

  const { form, validationSchema, isLoading, getPrinterByIdError } = usePrinterForm({
    editPrinterId,
    formMode,
    onSubmit: onClose,
  });

  if (getPrinterByIdError) {
    return (
      <DialogQueryError
        testId="dialog-error-get-printer-by-id-query"
        title={PRINTER_EDIT_ERROR_TITLE}
        errorMessage={PRINTER_FETCH_ERROR_MESSAGE}
        onClose={onClose}
      />
    );
  }

  return (
    <MaintenanceDialog
      testId="dialog-create-edit-printer"
      open={createPrinter === true || editPrinterId !== undefined}
      form={form}
      formMode={formMode}
      validationSchema={validationSchema}
      onClose={onClose}
      isLoading={isLoading}
      title={
        formMode === FormMode.Create
          ? PRINTER_CREATE_TITLE
          : formMode === FormMode.Update
            ? PRINTER_EDIT_TITLE
            : undefined
      }
    >
      <FormPrinter />
    </MaintenanceDialog>
  );
}
