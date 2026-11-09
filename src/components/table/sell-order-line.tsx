import { useDbClient } from "@tanstack/react-db";
import { BoltIcon, PlusIcon } from "lucide-react";
import { useMemo } from "react";

import sellOrderLineCollection, { restoreSellOrderLine } from "@/collections/sell-order-line";
import DialogBlueprintViewer from "@/components/dialog/blueprint-viewer";
import CreateSellOrderLineDialog from "@/components/dialog/create-sell-order-line";
import PickerPartPrice from "@/components/picker/picker-part-price";
import BaseTable from "@/components/table/base-table";
import { DEFAULT_DESCRIPTION_COLUMN_SIZE, createTableColumnHelper } from "@/components/table/column-helper";
import { TableCellSellOrderLineStatus } from "@/components/table/table-cell-sell-order-line-status";
import { ButtonCopyLayout } from "@/components/ui/button-copy";
import ButtonLink from "@/components/ui/button-link";
import { ModelActions } from "@/components/ui/model-actions";
import PriceInput from "@/components/ui/price-input";
import { useAppContext } from "@/contexts/app-context";
import type { TSellOrderForm } from "@/form/hooks/use-sell-order";
import type { TSellOrderLineForm, TUseSellOrderStatusProps } from "@/form/hooks/use-sell-order";
import { formatDate, formatPrice } from "@/lib/formatters";
import { formatCents, getLineTotalInCents, getLinesTotalInCents } from "@/lib/prices";
import { clampPendingQuantity, computeSellOrderLineStatus } from "@/lib/sell-order-line";
import { serializeSellOrderLine } from "@/lib/serializers";
import log from "@/logging/log";
import { LogMessages, LoggerLevels } from "@/logging/types";
import {
  ACTIONS_LABEL,
  ADD_PART_LABEL,
  DESCRIPTION_LABEL,
  NOTES_LABEL,
  PARTS_LABEL,
  PART_LABEL,
  PRICE_LABEL,
  QUANTITY_LABEL,
  STATUS_LABEL,
  STATUS_PENDING_LABEL,
  TOTAL_LABEL,
  UNKNOWN_ERROR_MESSAGE,
} from "@/messages/common";
import {
  SELL_ORDER_LINE_DELETE_MESSAGE,
  SELL_ORDER_LINE_DELETE_TITLE,
  SELL_ORDER_LINE_DELETED_MESSAGE,
  SELL_ORDER_LINE_EDITED_MESSAGE,
  SELL_ORDER_LINE_RESTORE_MESSAGE,
  SELL_ORDER_LINE_RESTORE_TITLE,
  SELL_ORDER_LINE_RESTORED_MESSAGE,
  SELL_ORDER_LINE_VALIDATION_ERROR_MESSAGE,
  DELIVERY_LABEL,
} from "@/messages/sell-order";
import { useQueryProductionOrderStatusesBySellOrderLineIds } from "@/queries/production-order";
import { ProductionOrderStatus } from "@/schemas/production-order";
import type { TUpdateSellOrderLine } from "@/schemas/sell-order-line";
import { SellOrderLineStatus, updateSellOrderLineSchema } from "@/schemas/sell-order-line";
import { CellDataType, TableMode } from "@/types";

interface TableSellOrderLineProps {
  tableMode: TableMode;
  sellOrderLines?: Array<TSellOrderLineForm>;
  sellOrder?: TSellOrderForm;
  createSellOrderLine?: boolean;
  currentClientId?: number | null;
  editPartPriceId?: number;
  className?: string;
}

const columnHelper = createTableColumnHelper<TSellOrderLineForm>();

// Only Pending lines have no Orden de producción yet, otherwise its pending quantity would be produced twice. A return
// is pending too, but it is delivered back without being produced
function ButtonProductionOrder({ sellOrderLine, sellOrder }: TUseSellOrderStatusProps) {
  const sellOrderLineIds = useMemo(() => [sellOrderLine.id], [sellOrderLine.id]);
  const { data: productionOrders } = useQueryProductionOrderStatusesBySellOrderLineIds(sellOrderLineIds);
  const productionOrder = productionOrders.find(({ status }) => status !== ProductionOrderStatus.Deleted);
  if (productionOrder) {
    return (
      <ButtonLink
        testId="button-production-order"
        to="/production-order/$id"
        params={{ id: productionOrder.id }}
        size="icon"
        showExternalLinkIcon={false}
      >
        <BoltIcon />
      </ButtonLink>
    );
  }
  const status = computeSellOrderLineStatus({
    productionOrderStatuses: productionOrders.map(({ status }) => status),
    sellOrder,
    sellOrderLine,
  });
  if (status !== SellOrderLineStatus.Pending || sellOrderLine.quantity < 0) return null;
  return (
    <ButtonLink
      testId="button-create-production-order"
      to="/create-production-order"
      search={{ sellOrderLineId: sellOrderLine.id }}
      variant="success"
      size="icon"
      showExternalLinkIcon={false}
    >
      <BoltIcon />
    </ButtonLink>
  );
}

export default function TableSellOrderLine({
  tableMode,
  sellOrderLines,
  sellOrder,
  createSellOrderLine,
  currentClientId,
  editPartPriceId,
  className,
}: TableSellOrderLineProps) {
  const dbClient = useDbClient();
  const { isAdmin, toaster, showToastOnTransaction } = useAppContext();

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: "status",
        header: STATUS_LABEL,
        cell: ({ row }) => <TableCellSellOrderLineStatus sellOrderLine={row.original} sellOrder={sellOrder!} />,
      }),
      columnHelper.display({
        cell: ({ row }) =>
          row.original.partReference && (
            <ButtonCopyLayout value={row.original.partReference.reference}>
              <ButtonLink to="/part/$id" params={{ id: row.original.partReference.part?.id }}>
                {row.original.partReference.reference}
              </ButtonLink>
            </ButtonCopyLayout>
          ),
        header: PART_LABEL,
        id: "part",
      }),
      columnHelper.accessor((row) => row.partReference?.part?.description ?? row.description, {
        header: DESCRIPTION_LABEL,
        id: "description",
        enableResizing: true,
        size: DEFAULT_DESCRIPTION_COLUMN_SIZE,
      }),
      columnHelper.accessor("quantity", {
        header: QUANTITY_LABEL,
        id: "quantity",
        meta: { dataType: CellDataType.Number, editable: true, min: -Infinity },
      }),
      columnHelper.accessor("pendingQuantity", {
        header: STATUS_PENDING_LABEL,
        id: "pendingQuantity",
        meta: { dataType: CellDataType.Number, editable: true, min: -Infinity },
      }),
      ...(isAdmin
        ? [
            columnHelper.accessor("partPrice", {
              cell: (info) => formatPrice(info.getValue()),
              header: PRICE_LABEL,
              id: "partPrice",
              meta: {
                dataType: CellDataType.Picker,
                editable: true,
                cellClassName: "text-right tabular-nums",
                renderEditableCell: ({ cell, onRowEdit, value, setValue, onBlur }) => (
                  <div className="flex flex-row gap-1">
                    <PriceInput
                      testId="input-part-price"
                      min={-Infinity}
                      value={value as string | null}
                      onValueChange={setValue}
                      onBlur={onBlur}
                      readOnly={cell.row.original.deletedAt !== null}
                    />
                    {cell.row.original.deletedAt === null && cell.row.original.partReferenceId !== null && (
                      <PickerPartPrice
                        key={cell.row.original.partPrice ?? "none"}
                        testId="input-picker-part-price"
                        partId={cell.row.original.partReference?.part?.id}
                        currentClientId={currentClientId}
                        label={null}
                        showFormattedActiveItem={false}
                        onRowSelect={(newValue) => {
                          const newPrice = newValue?.price ?? null;
                          setValue(newPrice);
                          void onRowEdit?.(cell, newPrice);
                        }}
                        className="w-fit"
                        initialValue={
                          cell.row.original.partPrice !== null
                            ? {
                                activeItemId: null,
                                formattedActiveItem: formatPrice(cell.row.original.partPrice),
                              }
                            : null
                        }
                      />
                    )}
                  </div>
                ),
              },
            }),
            columnHelper.accessor(
              (line) => getLineTotalInCents({ quantity: line.quantity, unitPrice: line.partPrice }),
              {
                cell: ({ getValue }) => formatCents(getValue()),
                header: TOTAL_LABEL,
                id: "total",
                meta: { dataType: CellDataType.Price },
              },
            ),
          ]
        : []),
      columnHelper.accessor("requestedDeliveryDate", {
        cell: (info) => formatDate(info.getValue()),
        header: DELIVERY_LABEL,
        meta: { dataType: CellDataType.Date, editable: true },
      }),
      columnHelper.accessor("notes", {
        header: NOTES_LABEL,
        id: "notes",
        enableResizing: true,
        size: 200,
        meta: { dataType: CellDataType.String, editable: true },
      }),
      columnHelper.display({
        cell: ({ row }) => (
          <ModelActions
            extraComponentsStart={
              <>
                <DialogBlueprintViewer
                  title={`Planos del Artículo ${row.original.partReference?.reference}`}
                  blueprints={row.original.partReference?.part?.blueprints}
                />
                {isAdmin && row.original.partReference != null && sellOrder !== undefined && (
                  <ButtonProductionOrder sellOrderLine={row.original} sellOrder={sellOrder} />
                )}
              </>
            }
            deleteButton={
              tableMode !== TableMode.ReadOnly && row.original.deletedAt === null
                ? {
                    dialogTitle: SELL_ORDER_LINE_DELETE_TITLE,
                    dialogDescription: SELL_ORDER_LINE_DELETE_MESSAGE,
                    serializedModel: serializeSellOrderLine(row.original),
                    onConfirm: () =>
                      void showToastOnTransaction({
                        transaction: () =>
                          dbClient.collection(sellOrderLineCollection).delete(row.original.id, {
                            optimistic: import.meta.env.VITE_ENV_NAME !== "test",
                          }),
                        onSuccess: { title: SELL_ORDER_LINE_DELETED_MESSAGE },
                      }),
                  }
                : undefined
            }
            restoreButton={
              tableMode !== TableMode.ReadOnly && row.original.deletedAt !== null
                ? {
                    dialogTitle: SELL_ORDER_LINE_RESTORE_TITLE,
                    dialogDescription: SELL_ORDER_LINE_RESTORE_MESSAGE,
                    serializedModel: serializeSellOrderLine(row.original),
                    onConfirm: () =>
                      void showToastOnTransaction({
                        transaction: () => restoreSellOrderLine({ dbClient, sellOrderLineId: row.original.id }),
                        onSuccess: { title: SELL_ORDER_LINE_RESTORED_MESSAGE },
                      }),
                  }
                : undefined
            }
          />
        ),
        header: ACTIONS_LABEL,
        id: "actions",
      }),
    ],
    [currentClientId, tableMode, isAdmin, sellOrder, dbClient, showToastOnTransaction],
  );

  const totalInCents = getLinesTotalInCents(
    sellOrderLines
      ?.filter((line) => line.deletedAt === null)
      .map((line) => ({ quantity: line.quantity, unitPrice: line.partPrice })) ?? [],
  );

  return (
    <>
      <BaseTable
        testId="table-sell-order-line"
        title={PARTS_LABEL}
        tableMode={tableMode}
        rows={sellOrderLines}
        columns={columns}
        className={className}
        skeletonRowsCount={3}
        onRowEdit={async (cell, value) => {
          const { row } = cell;
          const input: TUpdateSellOrderLine = {
            id: row.original.id,
            quantity: row.original.quantity,
            pendingQuantity: row.original.pendingQuantity,
            partPrice: row.original.partPrice,
            requestedDeliveryDate: row.original.requestedDeliveryDate,
            notes: row.original.notes,
            [cell.column.id]: value,
          };
          if (cell.column.id === "quantity" && typeof value === "number") {
            input.pendingQuantity = clampPendingQuantity(input.pendingQuantity, value);
          }
          const mutationValidationResult = updateSellOrderLineSchema.safeParse(input);
          if (!mutationValidationResult.success) {
            toaster.error({
              description:
                mutationValidationResult.error.issues.map((issue) => issue.message).join(", ") || UNKNOWN_ERROR_MESSAGE,
              title: SELL_ORDER_LINE_VALIDATION_ERROR_MESSAGE,
            });
            await log(LoggerLevels.error, LogMessages.sellOrderLineValidationFailed, {
              error: mutationValidationResult.error,
            });
            return;
          }
          await showToastOnTransaction({
            transaction: () =>
              dbClient.collection(sellOrderLineCollection).update(row.original.id, (draft) => {
                draft.quantity = input.quantity;
                draft.pendingQuantity = input.pendingQuantity;
                draft.partPrice = input.partPrice;
                draft.requestedDeliveryDate = input.requestedDeliveryDate;
                draft.notes = input.notes;
              }),
            onSuccess: { title: SELL_ORDER_LINE_EDITED_MESSAGE },
          });
        }}
        headerExtraComponents={
          ![TableMode.ReadOnly, TableMode.Picker].includes(tableMode) && (
            <ButtonLink
              testId="button-add-sell-order-line"
              variant="success"
              to="."
              search={(prev) => ({ ...prev, createSellOrderLine: true })}
            >
              <PlusIcon /> {ADD_PART_LABEL}
            </ButtonLink>
          )
        }
      />
      {isAdmin && (
        <span data-testid="span-sell-order-lines-total" className="self-end font-bold">
          Total sin IVA: {sellOrderLines !== undefined && formatCents(totalInCents)}
        </span>
      )}
      <CreateSellOrderLineDialog
        open={createSellOrderLine === true}
        sellOrderId={sellOrder?.id}
        currentClientId={currentClientId}
        editPartPriceId={editPartPriceId}
      />
    </>
  );
}
