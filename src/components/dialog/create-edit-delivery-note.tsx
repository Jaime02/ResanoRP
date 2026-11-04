import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import MaintenanceDialog from "@/components/dialog/maintenance-dialog";
import DialogQueryError from "@/components/dialog/query-error";
import FormDeliveryNote from "@/form/forms/delivery-note";
import useDeliveryNoteForm from "@/form/hooks/use-delivery-note";
import useFormMode from "@/form/hooks/use-form-mode";
import {
  DELIVERY_NOTE_CREATE_TITLE,
  DELIVERY_NOTE_EDIT_ERROR_TITLE,
  DELIVERY_NOTE_EDIT_TITLE,
  DELIVERY_NOTE_FETCH_ERROR_MESSAGE,
} from "@/messages/delivery-note";
import { FormMode } from "@/types";
import type { BaseDeliveryNoteSerialized } from "@/types/delivery-note";

interface CreateEditDeliveryNoteDialogProps {
  createDeliveryNote?: boolean;
  createDeliveryNoteLine?: boolean;
  editDeliveryNoteId?: number;
  printTagDeliveryNoteLineId?: number;
}

export default function CreateEditDeliveryNoteDialog({
  createDeliveryNote,
  createDeliveryNoteLine,
  editDeliveryNoteId,
  printTagDeliveryNoteLineId,
}: CreateEditDeliveryNoteDialogProps) {
  const navigate = useNavigate();

  const requestedFormMode = useFormMode({ create: createDeliveryNote, edit: editDeliveryNoteId !== undefined });

  const onClose = useCallback(
    async () =>
      navigate({
        search: (prev) => ({
          ...prev,
          createDeliveryNote: undefined,
          editDeliveryNoteId: undefined,
        }),
        to: ".",
      }),
    [navigate],
  );

  const onSubmit = useCallback(
    async (deliveryNote: BaseDeliveryNoteSerialized) => {
      if (requestedFormMode === FormMode.Update) {
        await onClose();
        return;
      }
      if (requestedFormMode === FormMode.Create) {
        await navigate({
          search: (prev) => ({
            ...prev,
            createDeliveryNote: undefined,
            editDeliveryNoteId: deliveryNote.id,
          }),
          to: ".",
        });
        return;
      }
    },
    [requestedFormMode, navigate, onClose],
  );

  const { form, formMode, validationSchema, deliveryNote, isLoading, getDeliveryNoteByIdError } = useDeliveryNoteForm({
    deliveryNoteId: editDeliveryNoteId,
    requestedFormMode,
    onSubmit,
  });

  if (getDeliveryNoteByIdError) {
    return (
      <DialogQueryError
        testId="dialog-error-get-delivery-note-by-id-query"
        title={DELIVERY_NOTE_EDIT_ERROR_TITLE}
        errorMessage={DELIVERY_NOTE_FETCH_ERROR_MESSAGE}
        onClose={onClose}
      />
    );
  }

  return (
    <MaintenanceDialog
      testId="dialog-create-edit-delivery-note"
      open={createDeliveryNote === true || editDeliveryNoteId !== undefined}
      title={formMode === FormMode.Create ? DELIVERY_NOTE_CREATE_TITLE : DELIVERY_NOTE_EDIT_TITLE}
      form={form}
      formMode={formMode}
      onClose={onClose}
      isLoading={isLoading}
      validationSchema={validationSchema}
    >
      <FormDeliveryNote
        deliveryNote={deliveryNote}
        createDeliveryNoteLine={createDeliveryNoteLine}
        printTagDeliveryNoteLineId={printTagDeliveryNoteLineId}
      />
    </MaintenanceDialog>
  );
}
