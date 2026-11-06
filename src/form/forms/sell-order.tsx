import { useDbClient } from "@tanstack/react-db";
import { useSelector } from "@tanstack/react-store";

import sellOrderCollection from "@/collections/sell-order";
import DialogSellOrderFile from "@/components/dialog/sell-order-file";
import TableSellOrderLine from "@/components/table/sell-order-line";
import TooltipSellOrderStatus from "@/components/tooltip/sell-order-status";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ModelActions } from "@/components/ui/model-actions";
import { useAppContext } from "@/contexts/app-context";
import { FormContextProvider } from "@/form";
import type { UseSellOrderFormProps } from "@/form/hooks/use-sell-order";
import useSellOrderForm, { getSellOrderStatus } from "@/form/hooks/use-sell-order";
import { serializeSellOrder } from "@/lib/serializers";
import {
  CLIENT_LABEL,
  CREATE_LABEL,
  DELETE_LABEL,
  FILE_LABEL,
  NOTES_LABEL,
  PAYMENT_METHOD_LABEL,
  RESTORE_LABEL,
} from "@/messages/common";
import {
  ADD_LINES_REQUIRES_SELL_ORDER_MESSAGE,
  CLIENT_REFERENCE_LABEL,
  RECEPTION_DATE_LABEL,
  SELL_ORDER_DELETE_MESSAGE,
  SELL_ORDER_DELETE_TITLE,
  SELL_ORDER_DELETED_MESSAGE,
  SELL_ORDER_LOAD_ERROR_MESSAGE,
  SELL_ORDER_RESTORE_MESSAGE,
  SELL_ORDER_RESTORE_TITLE,
  SELL_ORDER_RESTORED_MESSAGE,
} from "@/messages/sell-order";
import { SellOrderStatus } from "@/schemas/sell-order";
import trpc from "@/trpc/trpc-client";
import { FormMode, TableMode } from "@/types";

const formModeToTableModeMap: Record<FormMode, TableMode> = {
  [FormMode.Create]: TableMode.Disabled,
  [FormMode.Update]: TableMode.Editable,
  [FormMode.ReadOnly]: TableMode.ReadOnly,
  [FormMode.NotApplicable]: TableMode.ReadOnly,
};

interface FormSellOrderProps extends Pick<
  UseSellOrderFormProps,
  "requestedFormMode" | "onSubmit" | "editSellOrderId" | "controlledSellOrder" | "skipQueries"
> {
  createSellOrderLine?: boolean;
  editPartPriceId?: number;
  showStatus?: boolean;
  showActions?: boolean;
}

export default function FormSellOrder({
  requestedFormMode,
  onSubmit,
  editSellOrderId,
  controlledSellOrder,
  createSellOrderLine,
  editPartPriceId,
  skipQueries,
  showStatus = true,
  showActions = true,
}: FormSellOrderProps) {
  const dbClient = useDbClient();
  const { showToastOnTransaction, showToastOnTRPCMutation } = useAppContext();

  const { form, formMode, sellOrder, isLoading, getSellOrderByIdQueryError, validationSchema } = useSellOrderForm({
    controlledSellOrder,
    editSellOrderId,
    requestedFormMode,
    onSubmit,
    skipQueries,
  } as UseSellOrderFormProps);

  const clientId = useSelector(form.store, (state) => state.values.clientId);
  const status = getSellOrderStatus(sellOrder);

  return (
    <FormContextProvider
      testId="form-sell-order"
      form={form as any}
      formMode={formMode}
      isLoading={isLoading}
      errorMessage={getSellOrderByIdQueryError ? SELL_ORDER_LOAD_ERROR_MESSAGE : undefined}
      validationSchema={validationSchema}
    >
      <div className="flex flex-col items-center gap-2 overflow-auto">
        {formMode !== FormMode.Create && (
          <div className="flex flex-row items-center gap-2">
            {showStatus && (
              <Badge variant="outline" testId="badge-sell-order-status">
                Estado:
                <TooltipSellOrderStatus status={status} />
              </Badge>
            )}
            {sellOrder && <DialogSellOrderFile sellOrder={sellOrder} />}
          </div>
        )}
        <div className="flex w-full flex-col gap-2 md:grid md:grid-cols-[repeat(3,auto)] md:justify-center">
          <form.AppField
            name="receptionDate"
            children={(field) => (
              <field.DateInput
                id="form-sell-order-reception-date"
                testId="reception-date"
                label={RECEPTION_DATE_LABEL}
              />
            )}
          />
          <form.AppField
            name="clientId"
            children={(field) => (
              <field.ClientCombobox
                id="form-sell-order-client-id"
                testId="combobox-form-sell-order-client-id"
                label={CLIENT_LABEL}
                readOnly={formMode !== FormMode.Create}
              />
            )}
          />
          <form.AppField
            name="clientReference"
            children={(field) => (
              <field.TextInput id="form-sell-order-client-reference" label={CLIENT_REFERENCE_LABEL} />
            )}
          />
          <form.AppField
            name="paymentMethodId"
            children={(field) => (
              <field.PaymentMethodCombobox id="form-sell-order-payment-method-id" label={PAYMENT_METHOD_LABEL} />
            )}
          />
          {formMode !== FormMode.ReadOnly && (
            <form.AppField
              name="sellOrderFile"
              children={(field) => (
                <field.FilesInput id="form-sell-order-file" label={FILE_LABEL} accept={{ "application/pdf": [] }} />
              )}
            />
          )}
          <form.AppField
            name="notes"
            children={(field) => (
              <field.TextareaInput
                id="form-sell-order-notes"
                label={NOTES_LABEL}
                layoutClassName="flex flex-col"
                className="grow"
              />
            )}
          />
        </div>
        <Card
          className="col-span-2 justify-self-center"
          disabledMessage={formMode === FormMode.Create ? ADD_LINES_REQUIRES_SELL_ORDER_MESSAGE : undefined}
        >
          <TableSellOrderLine
            tableMode={formModeToTableModeMap[formMode]}
            sellOrderLines={sellOrder?.sellOrderLines}
            sellOrder={sellOrder}
            createSellOrderLine={createSellOrderLine}
            currentClientId={clientId}
            editPartPriceId={editPartPriceId}
          />
        </Card>
        {showActions && (
          <ModelActions
            disabled={isLoading || !sellOrder}
            deleteButton={
              sellOrder && status !== SellOrderStatus.Deleted
                ? {
                    dialogTriggerTestId: "button-delete-sell-order",
                    dialogTitle: SELL_ORDER_DELETE_TITLE,
                    dialogDescription: SELL_ORDER_DELETE_MESSAGE,
                    triggerExtraComponents: DELETE_LABEL,
                    size: "default",
                    serializedModel: serializeSellOrder(sellOrder),
                    onConfirm: async () =>
                      showToastOnTransaction({
                        transaction: () => dbClient.collection(sellOrderCollection).delete(sellOrder.id),
                        onSuccess: { title: SELL_ORDER_DELETED_MESSAGE },
                      }),
                  }
                : undefined
            }
            restoreButton={
              sellOrder && status === SellOrderStatus.Deleted
                ? {
                    dialogTriggerTestId: "button-restore-sell-order",
                    dialogTitle: SELL_ORDER_RESTORE_TITLE,
                    dialogDescription: SELL_ORDER_RESTORE_MESSAGE,
                    triggerExtraComponents: RESTORE_LABEL,
                    size: "default",
                    serializedModel: serializeSellOrder(sellOrder),
                    onConfirm: async () => {
                      await showToastOnTRPCMutation({
                        mutation: trpc.sellOrder.restore.mutate(sellOrder.id),
                        onSuccess: { title: SELL_ORDER_RESTORED_MESSAGE },
                        collection: sellOrderCollection,
                      });
                    },
                  }
                : undefined
            }
            extraComponentsEnd={
              formMode !== FormMode.ReadOnly && (
                <form.ButtonSubmit
                  testId="button-submit-form-sell-order"
                  disableIfPristine
                  customText={formMode === FormMode.Create ? CREATE_LABEL : undefined}
                />
              )
            }
          />
        )}
      </div>
    </FormContextProvider>
  );
}
