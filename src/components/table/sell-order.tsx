import { useDbClient } from "@tanstack/react-db";
import { useNavigate } from "@tanstack/react-router";
import type { Row } from "@tanstack/react-table";
import { PlusIcon } from "lucide-react";
import { useCallback, useMemo } from "react";

import sellOrderCollection from "@/collections/sell-order";
import DialogSellOrderFile from "@/components/dialog/sell-order-file";
import PopoverPartPickerFilter from "@/components/popover/part-picker-filter";
import type { PublicBaseTableProps, TBaseTableFeatures } from "@/components/table/base-table";
import BaseTable from "@/components/table/base-table";
import { createTableColumnHelper } from "@/components/table/column-helper";
import TooltipSellOrderStatus from "@/components/tooltip/sell-order-status";
import ButtonLink from "@/components/ui/button-link";
import { ModelActions } from "@/components/ui/model-actions";
import { TableCell, TableRow } from "@/components/ui/table";
import { useAppContext } from "@/contexts/app-context";
import FormSellOrder from "@/form/forms/sell-order";
import { getSellOrderStatus, type TSellOrderForm } from "@/form/hooks/use-sell-order";
import { formatDate } from "@/lib/formatters";
import { serializeSellOrder } from "@/lib/serializers";
import { ACTIONS_LABEL, CLIENT_LABEL, DATE_LABEL, NUMBER_LABEL, STATUS_LABEL } from "@/messages/common";
import {
  SELL_ORDER_DELETE_MESSAGE,
  SELL_ORDER_DELETE_TITLE,
  SELL_ORDER_DELETED_MESSAGE,
  SELL_ORDER_LINES_LABEL,
  SELL_ORDER_RESTORE_MESSAGE,
  SELL_ORDER_RESTORE_TITLE,
  SELL_ORDER_CREATE_TITLE,
  SELL_ORDER_RESTORED_MESSAGE,
} from "@/messages/sell-order";
import { useQuerySellOrders } from "@/queries/sell-order";
import type { TTableSellOrderState } from "@/schemas/sell-order";
import trpc from "@/trpc/trpc-client";
import { CellDataType, FormMode } from "@/types";

type TableSellOrderProps = PublicBaseTableProps<TSellOrderForm, TTableSellOrderState>;

const DEFAULT_STATE: TTableSellOrderState = { sorts: [{ desc: true, id: "id" }] };

const columnHelper = createTableColumnHelper<TSellOrderForm>();

export default function TableSellOrder({ testId = "table-sell-order", state, ...props }: TableSellOrderProps) {
  const { isAdmin, showToastOnTransaction, showToastOnTRPCMutation } = useAppContext();
  const navigate = useNavigate();
  const dbClient = useDbClient();

  const onEdit = useCallback(
    async (sellOrderId: number) => {
      await navigate({
        params: { id: sellOrderId },
        to: "/sell-order/$id",
      });
    },
    [navigate],
  );

  const {
    data: sellOrders,
    isLoading: isLoadingSellOrders,
    rowCount,
  } = useQuerySellOrders({
    filters: state?.filters ?? DEFAULT_STATE.filters,
    sorts: state?.sorts ?? DEFAULT_STATE.sorts,
    pagination: state?.pagination,
  });

  const columns = useMemo(
    () => [
      columnHelper.accessor("id", {
        enableColumnFilter: true,
        enableSorting: true,
        header: NUMBER_LABEL,
        meta: { dataType: CellDataType.Number },
      }),
      columnHelper.accessor((sellOrder) => getSellOrderStatus(sellOrder), {
        cell: ({ cell }) => <TooltipSellOrderStatus status={cell.getValue()} />,
        enableColumnFilter: true,
        header: STATUS_LABEL,
        id: "status",
        size: 140,
        meta: { dataType: CellDataType.Enum, enumName: "SellOrderStatus", filterFieldName: "statuses" },
      }),
      columnHelper.accessor((sellOrder) => sellOrder.receptionDate, {
        cell: (info) => formatDate(info.getValue()),
        enableColumnFilter: true,
        enableSorting: true,
        header: DATE_LABEL,
        id: "receptionDate",
        meta: { dataType: CellDataType.Date },
      }),
      columnHelper.accessor((sellOrder) => sellOrder.client?.name, {
        enableColumnFilter: true,
        enableResizing: true,
        enableSorting: true,
        header: CLIENT_LABEL,
        id: "clientName",
        meta: { dataType: CellDataType.String, filterFieldName: "clientName" },
        size: 400,
      }),
      columnHelper.accessor("sellOrderLines", {
        cell: (info) => info.getValue().length,
        header: SELL_ORDER_LINES_LABEL,
      }),
      ...(isAdmin
        ? [
            columnHelper.display({
              cell: ({ row }) => (
                <ModelActions
                  extraComponentsStart={<DialogSellOrderFile sellOrderId={row.original.id} iconOnly />}
                  onEdit={async () => onEdit(row.original.id)}
                  deleteButton={
                    row.original.deletedAt === null
                      ? {
                          dialogTitle: SELL_ORDER_DELETE_TITLE,
                          dialogDescription: SELL_ORDER_DELETE_MESSAGE,
                          serializedModel: serializeSellOrder(row.original),
                          onConfirm: async () =>
                            showToastOnTransaction({
                              transaction: () =>
                                dbClient.collection(sellOrderCollection).delete(row.original.id, {
                                  optimistic: import.meta.env.VITE_ENV_NAME !== "test",
                                }),
                              onSuccess: { title: SELL_ORDER_DELETED_MESSAGE },
                            }),
                        }
                      : undefined
                  }
                  restoreButton={
                    row.original.deletedAt !== null
                      ? {
                          dialogTitle: SELL_ORDER_RESTORE_TITLE,
                          dialogDescription: SELL_ORDER_RESTORE_MESSAGE,
                          serializedModel: serializeSellOrder(row.original),
                          onConfirm: () =>
                            void showToastOnTRPCMutation({
                              mutation: trpc.sellOrder.restore.mutate(row.original.id),
                              onSuccess: { title: SELL_ORDER_RESTORED_MESSAGE },
                              collection: sellOrderCollection,
                            }),
                        }
                      : undefined
                  }
                />
              ),
              size: 100,
              header: ACTIONS_LABEL,
              id: "actions",
            }),
          ]
        : []),
    ],
    [isAdmin, onEdit, dbClient, showToastOnTransaction, showToastOnTRPCMutation],
  );

  return (
    <BaseTable
      {...props}
      testId={testId}
      columns={columns}
      rows={sellOrders}
      rowCount={rowCount}
      state={state}
      isLoading={props.isLoading === true || isLoadingSellOrders}
      defaultState={DEFAULT_STATE}
      renderSubRows={SellOrderSubRow}
      customFiltersComponent={
        <PopoverPartPickerFilter
          testId="popover-sell-order-filters"
          filters={state?.filters}
          tableName={testId}
          defaultState={DEFAULT_STATE}
        />
      }
      headerExtraComponents={
        <ButtonLink variant="success" to="/create-sell-order">
          <PlusIcon /> {SELL_ORDER_CREATE_TITLE}
        </ButtonLink>
      }
    />
  );
}

interface SellOrderSubRowProps {
  row: Row<TBaseTableFeatures, TSellOrderForm>;
}

function SellOrderSubRow({ row }: SellOrderSubRowProps) {
  return (
    <TableRow testId={String(row.original.id)} variant="subrow" rowType="subrow">
      <TableCell colSpan={row.getAllCells().length} className="p-4">
        <FormSellOrder
          key={JSON.stringify(row.original)}
          requestedFormMode={FormMode.ReadOnly}
          controlledSellOrder={row.original}
          showStatus={false}
          showActions={false}
        />
      </TableCell>
    </TableRow>
  );
}
