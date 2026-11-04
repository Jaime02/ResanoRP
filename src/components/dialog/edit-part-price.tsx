import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import MaintenanceDialog from "@/components/dialog/maintenance-dialog";
import FormPartPrice from "@/form/forms/part-price";
import usePartPriceForm from "@/form/hooks/use-part-price";
import { PART_PRICE_EDIT_TITLE } from "@/messages/part-price";
import type { TPartPriceForm } from "@/queries/part";
import { FormMode } from "@/types";

interface DialogEditPartPriceProps {
  controlledPartPrice?: TPartPriceForm;
  editingPartId?: number;
}

export default function DialogEditPartPrice({ controlledPartPrice, editingPartId }: DialogEditPartPriceProps) {
  const navigate = useNavigate();

  const onClose = useCallback(
    async () =>
      navigate({
        search: (prev) => ({
          ...prev,
          createPartPricePartId: undefined,
          editPartPriceId: undefined,
        }),
        to: ".",
      }),
    [navigate],
  );

  const { form, validationSchema, isLoading } = usePartPriceForm({
    controlledPartPrice,
    editingPartId,
    requestedFormMode: FormMode.Update,
    onSubmit: onClose,
  });

  return (
    <MaintenanceDialog
      testId="dialog-edit-part-price"
      form={form}
      formMode={FormMode.Update}
      validationSchema={validationSchema}
      open={controlledPartPrice !== undefined}
      onClose={onClose}
      isLoading={isLoading}
      title={PART_PRICE_EDIT_TITLE}
    >
      <FormPartPrice />
    </MaintenanceDialog>
  );
}
