import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import MaintenanceDialog from "@/components/dialog/maintenance-dialog";
import useCreatePartComponentForm from "@/form/hooks/use-create-part-component";
import { PART_LABEL, QUANTITY_LABEL } from "@/messages/common";
import { PART_COMPONENT_CREATE_TITLE } from "@/messages/part";
import { TablePartPickerMode } from "@/types";

interface DialogCreatePartComponentProps {
  open?: boolean;
  partId?: number;
}

export default function DialogCreatePartComponent({ open, partId }: DialogCreatePartComponentProps) {
  const navigate = useNavigate();

  const onClose = useCallback(
    async () => navigate({ search: (prev) => ({ ...prev, createPartComponent: undefined }), to: "." }),
    [navigate],
  );

  const { form, formMode, validationSchema, isLoading } = useCreatePartComponentForm({ partId, onSubmit: onClose });

  return (
    <MaintenanceDialog
      testId="dialog-create-part-component"
      form={form}
      formMode={formMode}
      open={open === true && partId !== undefined}
      onClose={onClose}
      isLoading={isLoading}
      validationSchema={validationSchema}
      title={PART_COMPONENT_CREATE_TITLE}
      layoutClassName="items-end"
    >
      <form.AppField
        name="componentPartId"
        children={(field) => (
          <field.PickerPart
            id="picker-create-part-component"
            testId="picker-create-part-component"
            label={PART_LABEL}
            pickerMode={TablePartPickerMode.PickParts}
            onRowSelect={(row) => field.handleChange(row?.partId ?? null)}
          />
        )}
      />
      <form.AppField
        name="quantity"
        children={(field) => (
          <field.NumberInput
            id="input-create-part-component-quantity"
            testId="input-create-part-component-quantity"
            label={QUANTITY_LABEL}
          />
        )}
      />
    </MaintenanceDialog>
  );
}
