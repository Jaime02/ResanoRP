import { useDbClient } from "@tanstack/react-db";
import { useNavigate } from "@tanstack/react-router";
import { PlusIcon, TagIcon } from "lucide-react";
import { useMemo } from "react";

import deliveryNoteLineCollection from "@/collections/delivery-note-line";
import invoiceCollection from "@/collections/invoice";
import sellOrderLineCollection from "@/collections/sell-order-line";
import CreateDeliveryNoteLineDialog from "@/components/dialog/create-delivery-note-line";
import DialogPartTag from "@/components/dialog/delivery-note-line-tag";
import BaseTable from "@/components/table/base-table";
import { createTableColumnHelper } from "@/components/table/column-helper";
import { Button } from "@/components/ui/button";
import ButtonLink from "@/components/ui/button-link";
import { ModelActions } from "@/components/ui/model-actions";
import { useAppContext } from "@/contexts/app-context";
import { formatPrice } from "@/lib/formatters";
import { formatCents, getDeliveryNoteLineUnitPrice, getLineTotalInCents, getLinesTotalInCents } from "@/lib/prices";
import { serializeDeliveryNoteLine } from "@/lib/serializers";
import log from "@/logging/log";
import { LogMessages, LoggerLevels } from "@/logging/types";
import {
  ACTIONS_LABEL,
  ADD_PART_LABEL,
  DESCRIPTION_LABEL,
  PARTS_LABEL,
  PRICE_LABEL,
  QUANTITY_LABEL,
  REFERENCE_LABEL,
  TOTAL_LABEL,
} from "@/messages/common";
import {
  DELIVERY_NOTE_LINE_DELETE_MESSAGE,
  DELIVERY_NOTE_LINE_DELETE_TITLE,
  DELIVERY_NOTE_LINE_DELETED_MESSAGE,
  DELIVERY_NOTE_LINE_EDITED_MESSAGE,
  DELIVERY_NOTE_LINE_PRICE_EDITED_MESSAGE,
  DELIVERY_NOTE_LINE_VALIDATION_ERROR_MESSAGE,
} from "@/messages/delivery-note";
import { SELL_ORDER_LABEL } from "@/messages/sell-order";
import type { TDeliveryNoteLine } from "@/queries/delivery-note";
import type { TUpdateDeliveryNoteLine, TUpdateDeliveryNoteLinePrice } from "@/schemas/delivery-note-line";
import { updateDeliveryNoteLineSchema } from "@/schemas/delivery-note-line";
import trpc from "@/trpc/trpc-client";
import { CellDataType, TableMode } from "@/types";

interface TableDeliveryNoteLineProps {
  tableMode: TableMode;
  deliveryNoteLines?: Array<TDeliveryNoteLine>;
  deliveryNoteId?: number;
  createDeliveryNoteLine?: boolean;
  currentClientId?: number | null;
  printTagDeliveryNoteLineId?: number;
  className?: string;
}

const columnHelper = createTableColumnHelper<TDeliveryNoteLine>();

export default function TableDeliveryNoteLine({
  tableMode,
  deliveryNoteLines,
  deliveryNoteId,
  createDeliveryNoteLine,
  currentClientId,
  printTagDeliveryNoteLineId,
  className,
}: TableDeliveryNoteLineProps) {
  const { isAdmin, toaster, showToastOnTransaction, showToastOnTRPCMutation } = useAppContext();
  const navigate = useNavigate();
  const dbClient = useDbClient();

  const printTagPartQuantity = deliveryNoteLines?.find(
    (deliveryNoteLine) => deliveryNoteLine.id === printTagDeliveryNoteLineId,
  )?.quantity;

  const totalInCents = getLinesTotalInCents(
    deliveryNoteLines?.map((line) => ({ quantity: line.quantity, unitPrice: getDeliveryNoteLineUnitPrice(line) })) ??
      [],
  );

  const columns = useMemo(
    () => [
      columnHelper.accessor((line) => line.partReference?.reference, {
        cell: ({ row }) =>
          row.original.partReference != null ? (
            <ButtonLink to="/part/$id" params={{ id: row.original.partReference.part?.id }}>
              {row.original.partReference.reference}
            </ButtonLink>
          ) : null,
        header: REFERENCE_LABEL,
        id: "partReference",
      }),
      columnHelper.accessor((line) => line.description, {
        header: DESCRIPTION_LABEL,
        id: "description",
        enableResizing: true,
        size: 600,
      }),
      columnHelper.accessor("quantity", {
        header: QUANTITY_LABEL,
        id: "quantity",
        meta: { dataType: CellDataType.Number, editable: true, min: -Infinity },
      }),
      ...(isAdmin
        ? [
            columnHelper.accessor((line) => getDeliveryNoteLineUnitPrice(line), {
              cell: ({ getValue }) => formatPrice(getValue()),
              header: PRICE_LABEL,
              id: "unitPrice",
              meta: {
                dataType: CellDataType.Price,
                min: -Infinity,
                // The input keeps the value it starts with, so a Línea from a Pedido de venta waits for the price of
                // the Pedido de venta to load
                editable: (line) => line.sellOrderLineId === null || line.sellOrderLine !== undefined,
              },
            }),
            columnHelper.accessor(
              (line) => getLineTotalInCents({ quantity: line.quantity, unitPrice: getDeliveryNoteLineUnitPrice(line) }),
              {
                cell: ({ getValue }) => formatCents(getValue()),
                header: TOTAL_LABEL,
                id: "total",
                meta: { dataType: CellDataType.Price },
              },
            ),
          ]
        : []),
      columnHelper.display({
        cell: ({ row }) =>
          row.original.sellOrderLine?.sellOrder && (
            <ButtonLink to="/sell-order/$id" params={{ id: row.original.sellOrderLine.sellOrder.id }}>
              {row.original.sellOrderLine.sellOrder.clientReference ?? String(row.original.sellOrderLine.sellOrder.id)}
            </ButtonLink>
          ),
        header: SELL_ORDER_LABEL,
        id: "sellOrder",
      }),
      columnHelper.display({
        cell: ({ row }) => (
          <ModelActions
            deleteButton={
              isAdmin && tableMode === TableMode.Editable
                ? {
                    dialogTitle: DELIVERY_NOTE_LINE_DELETE_TITLE,
                    dialogDescription: DELIVERY_NOTE_LINE_DELETE_MESSAGE,
                    serializedModel: serializeDeliveryNoteLine(row.original),
                    onConfirm: () =>
                      void showToastOnTRPCMutation({
                        mutation: trpc.deliveryNoteLine.delete.mutate({ id: row.original.id }),
                        // The pending quantity restored on the Sell Order Line is clamped, and the Factura is only
                        // reset when it was accounted or sent, so the delete can end up not writing them at all. Only
                        // await a collection when the result says it was written, otherwise the txId wait times out.
                        collection: (result) => [
                          deliveryNoteLineCollection,
                          ...(result.updatedSellOrderLineIds.length > 0 ? [sellOrderLineCollection] : []),
                          ...(result.resetInvoiceIds.length > 0 ? [invoiceCollection] : []),
                        ],
                        onSuccess: {
                          title: DELIVERY_NOTE_LINE_DELETED_MESSAGE,
                        },
                      }),
                  }
                : undefined
            }
            extraComponentsStart={
              <Button
                testId="button-print-tag"
                disabled={row.original.quantity < 0}
                size="icon"
                variant="success"
                onClick={async () =>
                  navigate({
                    replace: true,
                    search: (prev) => ({
                      ...prev,
                      printTagDeliveryNoteLineId: row.original.id,
                    }),
                    to: ".",
                  })
                }
              >
                <TagIcon />
              </Button>
            }
          />
        ),
        header: ACTIONS_LABEL,
        id: "actions",
      }),
    ],
    [tableMode, isAdmin, navigate, showToastOnTRPCMutation],
  );

  return (
    <>
      <BaseTable
        testId="table-delivery-note-line"
        title={PARTS_LABEL}
        tableMode={tableMode}
        rows={deliveryNoteLines}
        columns={columns}
        className={className}
        skeletonRowsCount={3}
        onRowEdit={async (cell, value) => {
          const { row } = cell;
          if (cell.column.id === "unitPrice") {
            await showToastOnTRPCMutation({
              mutation: trpc.deliveryNoteLine.updatePrice.mutate({
                id: row.original.id,
                unitPrice: value as TUpdateDeliveryNoteLinePrice["unitPrice"],
              }),
              collection: (result) => [
                deliveryNoteLineCollection,
                ...(result.resetInvoiceIds.length > 0 ? [invoiceCollection] : []),
              ],
              onSuccess: { title: DELIVERY_NOTE_LINE_PRICE_EDITED_MESSAGE },
            });
            return;
          }
          const input: TUpdateDeliveryNoteLine = {
            id: row.original.id,
            quantity: row.original.quantity,
            description: row.original.description,
            [cell.column.id]: value,
          };
          const mutationValidationResult = updateDeliveryNoteLineSchema.safeParse(input);
          if (!mutationValidationResult.success) {
            toaster.error({ title: DELIVERY_NOTE_LINE_VALIDATION_ERROR_MESSAGE });
            await log(LoggerLevels.error, LogMessages.deliveryNoteLineValidationFailed, {
              error: mutationValidationResult.error,
            });
            return;
          }
          await showToastOnTransaction({
            transaction: () =>
              dbClient.collection(deliveryNoteLineCollection).update(input.id, (draft) => {
                draft.quantity = input.quantity;
                draft.description = input.description;
              }),
            onSuccess: { title: DELIVERY_NOTE_LINE_EDITED_MESSAGE },
          });
        }}
        headerExtraComponents={
          ![TableMode.ReadOnly, TableMode.Picker].includes(tableMode) && (
            <ButtonLink
              testId="button-add-delivery-note-line"
              variant="success"
              to="."
              search={(prev) => ({ ...prev, createDeliveryNoteLine: true })}
            >
              <PlusIcon /> {ADD_PART_LABEL}
            </ButtonLink>
          )
        }
      />
      {/* Shown while the Líneas load, so the layout does not move when the amount arrives */}
      {isAdmin && (
        <span data-testid="span-delivery-note-lines-total" className="self-end font-bold">
          Total sin IVA: {deliveryNoteLines !== undefined && formatCents(totalInCents)}
        </span>
      )}
      <CreateDeliveryNoteLineDialog
        open={createDeliveryNoteLine === true}
        deliveryNoteId={deliveryNoteId!}
        currentClientId={currentClientId}
      />
      <DialogPartTag printTagDeliveryNoteLineId={printTagDeliveryNoteLineId} partQuantity={printTagPartQuantity} />
    </>
  );
}
