import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import MaintenanceDialog from "@/components/dialog/maintenance-dialog";
import FormDeliveryNoteLine from "@/form/forms/delivery-note-line";
import useCreateDeliveryNoteLineForm from "@/form/hooks/use-create-delivery-note-line";
import { DELIVERY_NOTE_LINE_CREATE_TITLE } from "@/messages/delivery-note";

interface CreateDeliveryNoteLineDialogProps {
  open: boolean;
  deliveryNoteId: number;
  currentClientId?: number | null;
}

export default function CreateDeliveryNoteLineDialog({
  open,
  deliveryNoteId,
  currentClientId,
}: CreateDeliveryNoteLineDialogProps) {
  const navigate = useNavigate();

  const onClose = useCallback(
    async () =>
      navigate({
        search: (prev) => ({ ...prev, createDeliveryNoteLine: undefined }),
        to: ".",
      }),
    [navigate],
  );

  const { form, formMode, isLoading, validationSchema, isCustomLine, changeIsCustomLine } =
    useCreateDeliveryNoteLineForm({
      deliveryNoteId,
      onSubmit: onClose,
    });

  return (
    <MaintenanceDialog
      testId="dialog-create-delivery-note-line"
      open={open}
      title={DELIVERY_NOTE_LINE_CREATE_TITLE}
      form={form}
      formMode={formMode}
      onClose={onClose}
      isLoading={isLoading}
      validationSchema={validationSchema}
      layoutClassName="flex-col"
    >
      <FormDeliveryNoteLine
        currentClientId={currentClientId}
        isCustomLine={isCustomLine}
        changeIsCustomLine={changeIsCustomLine}
      />
    </MaintenanceDialog>
  );
}
