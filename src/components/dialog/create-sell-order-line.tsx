import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import MaintenanceDialog from "@/components/dialog/maintenance-dialog";
import FormSellOrderLine from "@/form/forms/sell-order-line";
import useCreateSellOrderLineForm from "@/form/hooks/use-create-sell-order-line";
import { SELL_ORDER_LINE_CREATE_TITLE } from "@/messages/sell-order";
import { FormMode } from "@/types";

interface CreateSellOrderLineDialogProps {
  open: boolean;
  sellOrderId?: number;
  currentClientId?: number | null;
  editPartPriceId?: number;
}

export default function CreateSellOrderLineDialog({
  open,
  sellOrderId,
  currentClientId,
  editPartPriceId,
}: CreateSellOrderLineDialogProps) {
  const navigate = useNavigate();

  const onClose = useCallback(
    async () =>
      navigate({
        search: (prev) => ({ ...prev, createSellOrderLine: undefined }),
        to: ".",
      }),
    [navigate],
  );

  const { form, isLoading, isCustomLine, changeIsCustomLine, validationSchema } = useCreateSellOrderLineForm({
    sellOrderId,
    onSubmit: onClose,
  });

  return (
    <MaintenanceDialog
      testId="dialog-create-sell-order-line"
      open={open}
      title={SELL_ORDER_LINE_CREATE_TITLE}
      form={form}
      formMode={FormMode.Create}
      onClose={onClose}
      isLoading={isLoading}
      validationSchema={validationSchema}
      layoutClassName="flex-col"
    >
      <FormSellOrderLine
        currentClientId={currentClientId}
        editPartPriceId={editPartPriceId}
        isCustomLine={isCustomLine}
        changeIsCustomLine={changeIsCustomLine}
      />
    </MaintenanceDialog>
  );
}
