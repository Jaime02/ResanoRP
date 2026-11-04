import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSelector } from "@tanstack/react-store";
import { PlusIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { z } from "zod";

import ComboboxDeliveryNote from "@/components/combobox/delivery-note";
import DialogQueryError from "@/components/dialog/query-error";
import TableDeliveryNote from "@/components/table/delivery-note";
import { TablePendingSellOrderLines } from "@/components/table/pending-sell-order-lines";
import { TableStagedOrderLine } from "@/components/table/staged-sell-order-line";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import { UserMode, useAppContext } from "@/contexts/app-context";
import { FormContextProvider } from "@/form";
import { StageSellOrderLinesFormMode, useStageSellOrderLinesForm } from "@/form/hooks/use-stage-sell-order-lines";
import {
  ADD_LINES_LABEL,
  ADD_LINES_TO_DELIVERY_NOTE_INVOICED_MESSAGE,
  ADD_LINES_TO_DELIVERY_NOTE_MESSAGE,
  ADD_LINES_TO_DELIVERY_NOTE_TITLE,
  ADD_TO_DELIVERY_NOTE_LABEL,
  CANCEL_DELIVERY_NOTE_CREATION_MESSAGE,
  CANCEL_DELIVERY_NOTE_CREATION_TITLE,
  DELIVERY_NOTE_CREATE_TITLE,
  LAST_DELIVERY_NOTES_TITLE,
  PARTS_TO_SERVE_TITLE,
  PENDING_SELL_ORDERS_FETCH_ERROR_MESSAGE,
  PENDING_SELL_ORDERS_FETCH_ERROR_TITLE,
} from "@/messages/delivery-note";
import { DISCARD_SERVED_LINES_LABEL } from "@/messages/delivery-note";
import { SERVE_PARTS_LABEL } from "@/messages/home";
import { PENDING_SELL_ORDERS_TITLE } from "@/messages/sell-order";
import { optionalIdSchema } from "@/schemas";
import type { TTableState } from "@/schemas";
import { tableDeliveryNoteStateSchema } from "@/schemas/delivery-note";
import { TableMode } from "@/types";

const routeSearchSchema = z.object({
  editDeliveryNoteId: optionalIdSchema.catch(undefined),
  printTagDeliveryNoteLineId: optionalIdSchema.catch(undefined),
  printTagSellOrderLineId: optionalIdSchema.catch(undefined),
});

export const Route = createFileRoute("/create-delivery-note")({
  beforeLoad: () => ({
    title: SERVE_PARTS_LABEL,
  }),
  component: RouteComponent,
  staticData: { userModes: [UserMode.Admin, UserMode.User] },
  validateSearch: routeSearchSchema,
});

function RouteComponent() {
  const { editDeliveryNoteId, printTagDeliveryNoteLineId, printTagSellOrderLineId } = Route.useSearch();
  const navigate = useNavigate();

  const [tableState, setTableState] = useState<TTableState | undefined>({ pagination: { pageSize: 6 } });
  const tableDeliveryNoteState = useMemo(() => tableDeliveryNoteStateSchema.safeParse(tableState).data, [tableState]);

  const [isOpenDialogConfirmationCancelDeliveryNote, setIsOpenDialogConfirmationCancelDeliveryNote] = useState(false);
  const { isAdmin } = useAppContext();

  const {
    form,
    formMode,
    pendingSellOrderLines,
    getPendingSellOrdersError,
    stagedSellOrderLines,
    stageSellOrderLinesFormMode,
    setStageSellOrderLinesFormMode,
    stageSellOrderLine,
    unstageSellOrderLine,
    updateStagedSellOrderLineQuantity,
    isLoading,
    validationSchema,
  } = useStageSellOrderLinesForm();

  const onAddLinesToExistingDeliveryNoteDialogOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        form.setFieldValue("deliveryNoteId", null);
      }
      setStageSellOrderLinesFormMode(
        open
          ? StageSellOrderLinesFormMode.AppendToExistingDeliveryNote
          : StageSellOrderLinesFormMode.CreateNewDeliveryNote,
      );
    },
    [form, setStageSellOrderLinesFormMode],
  );
  const currentClientId = useSelector(form.store, (state) => state.values.clientId);

  const onDialogQueryErrorClose = useCallback(async () => {
    await navigate({ to: "/" });
  }, [navigate]);

  useEffect(() => {
    // When loading the page, remove the print tag IDs from the URL
    void navigate({
      search: (prev) => ({ ...prev, printTagDeliveryNoteLineId: undefined, printTagSellOrderLineId: undefined }),
      to: ".",
    });
  }, [navigate]);

  if (getPendingSellOrdersError) {
    return (
      <DialogQueryError
        testId="dialog-error-get-pending-sell-orders-query"
        title={PENDING_SELL_ORDERS_FETCH_ERROR_TITLE}
        errorMessage={PENDING_SELL_ORDERS_FETCH_ERROR_MESSAGE}
        onClose={onDialogQueryErrorClose}
      />
    );
  }

  return (
    <>
      <FormContextProvider form={form as any} formMode={formMode} validationSchema={validationSchema}>
        <div className="flex flex-row items-center justify-center gap-2">
          <form.AppField
            name="clientId"
            children={(field) => (
              <field.ClientCombobox
                id="combobox-client-form-delivery-note"
                nullable
                onValueChange={(newValue) => {
                  if (stagedSellOrderLines && stagedSellOrderLines.length > 0) {
                    setIsOpenDialogConfirmationCancelDeliveryNote(true);
                  } else {
                    field.handleChange(newValue?.id ?? null);
                    form.setFieldValue("stagedSellOrderLines", undefined);
                  }
                }}
              />
            )}
          />
        </div>
        <Separator />
        <TablePendingSellOrderLines
          title={PENDING_SELL_ORDERS_TITLE}
          clientId={currentClientId}
          pendingSellOrderLines={pendingSellOrderLines}
          stagedSellOrderLines={stagedSellOrderLines}
          stageSellOrderLine={stageSellOrderLine}
          isLoading={isLoading}
          className="self-center"
        />
        <Separator />
        <TableStagedOrderLine
          title={PARTS_TO_SERVE_TITLE}
          isLoading={isLoading}
          stagedSellOrderLines={stagedSellOrderLines}
          updateStagedSellOrderLineQuantity={updateStagedSellOrderLineQuantity}
          unstageSellOrderLine={unstageSellOrderLine}
          skeletonRowsCount={1}
          className="self-center"
          printTagSellOrderLineId={printTagSellOrderLineId}
        />
        <div className="flex flex-row flex-wrap justify-end gap-2">
          {currentClientId !== null && (
            <form.AppField
              name="deliveryMethodId"
              children={(field) => (
                <field.DeliveryMethodCombobox
                  testId="combobox-delivery-method"
                  id="combobox-delivery-method-form-delivery-note"
                  label={null}
                  nullable
                />
              )}
            />
          )}
          <AlertDialog
            open={stageSellOrderLinesFormMode === StageSellOrderLinesFormMode.AppendToExistingDeliveryNote}
            onOpenChange={onAddLinesToExistingDeliveryNoteDialogOpenChange}
          >
            <form.Subscribe
              selector={(state) => [state.isValid, state.isPristine] as const}
              children={([isValid, isPristine]) => (
                <AlertDialogTrigger
                  testId="button-add-lines-to-existing-delivery-note"
                  disabled={!isValid || isPristine || isLoading}
                  onClick={() => {
                    onAddLinesToExistingDeliveryNoteDialogOpenChange(true);
                  }}
                >
                  <PlusIcon />
                  {ADD_TO_DELIVERY_NOTE_LABEL}
                </AlertDialogTrigger>
              )}
            />
            <AlertDialogContent data-testid="dialog-add-lines-to-existing-delivery-note-content">
              <AlertDialogTitle>{ADD_LINES_TO_DELIVERY_NOTE_TITLE}</AlertDialogTitle>
              <AlertDialogDescription>
                {isAdmin ? ADD_LINES_TO_DELIVERY_NOTE_INVOICED_MESSAGE : ADD_LINES_TO_DELIVERY_NOTE_MESSAGE}
              </AlertDialogDescription>
              <form.Field
                name="deliveryNoteId"
                children={(field) => (
                  <ComboboxDeliveryNote
                    testId="combobox-delivery-note"
                    clientId={currentClientId}
                    activeItemId={field.state.value ?? undefined}
                    onValueChange={(value) => {
                      field.handleChange(value?.id ?? null);
                    }}
                    className="self-center"
                  />
                )}
              />
              <AlertDialogFooter>
                <form.ButtonSubmit
                  testId="button-submit-add-lines-to-existing-delivery-note"
                  customText={ADD_LINES_LABEL}
                />
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <form.ButtonSubmit testId="button-submit-form-delivery-note" customText={DELIVERY_NOTE_CREATE_TITLE} />
        </div>
        <AlertDialog
          open={isOpenDialogConfirmationCancelDeliveryNote}
          onOpenChange={setIsOpenDialogConfirmationCancelDeliveryNote}
        >
          <AlertDialogContent data-testid="alert-dialog-confirmation-cancel-delivery-note-content">
            <AlertDialogTitle>{CANCEL_DELIVERY_NOTE_CREATION_TITLE}</AlertDialogTitle>
            <AlertDialogDescription>{CANCEL_DELIVERY_NOTE_CREATION_MESSAGE}</AlertDialogDescription>
            <AlertDialogFooter>
              <AlertDialogAction
                onClick={() => {
                  form.reset();
                  setIsOpenDialogConfirmationCancelDeliveryNote(false);
                }}
              >
                {DISCARD_SERVED_LINES_LABEL}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <Separator />
      </FormContextProvider>
      <TableDeliveryNote
        title={LAST_DELIVERY_NOTES_TITLE}
        state={tableDeliveryNoteState}
        onStateChange={setTableState}
        tableMode={TableMode.ReadOnly}
        editDeliveryNoteId={editDeliveryNoteId}
        printTagDeliveryNoteLineId={printTagDeliveryNoteLineId}
        className="mx-auto"
      />
    </>
  );
}
