import { ArrowRightIcon } from "lucide-react";
import { useMemo, useState } from "react";

import type { PublicBaseTableProps } from "@/components/table/base-table";
import BaseTable from "@/components/table/base-table";
import { DEFAULT_DATETIME_COLUMN_SIZE, createTableColumnHelper } from "@/components/table/column-helper";
import ButtonLink from "@/components/ui/button-link";
import { DateFormat, formatDate } from "@/lib/formatters";
import { DATE_LABEL, UNKNOWN_LABEL } from "@/messages/common";
import {
  ORIGIN_LABEL,
  PART_TRANSACTION_MANUAL_UPDATE_LABEL,
  PART_TRANSACTION_STOCK_UPDATE_LABEL,
  STOCK_LABEL,
  TRANSACTION_LABEL,
} from "@/messages/part";
import type { TPartStockRecord, TPartStockTransaction } from "@/queries/part";
import type { TTableState } from "@/schemas";
import { CellDataType } from "@/types";

interface TablePartTransactionsProps extends PublicBaseTableProps<TPartStockRecord> {
  partId?: number;
  rows?: Array<TPartStockRecord>;
}

const columnHelper = createTableColumnHelper<TPartStockRecord>();

export default function TablePartTransactions({ partId, rows, ...props }: TablePartTransactionsProps) {
  const [state, setState] = useState<TTableState | undefined>({ pagination: { pageSize: 5 } });

  const defaultState: TTableState = useMemo(() => ({ filters: [{ id: "partId", value: partId ?? null }] }), [partId]);

  const columns = useMemo(
    () => [
      columnHelper.display({
        cell: ({ row }) => <TransactionTypeDisplay transaction={row.original.transaction} />,
        header: TRANSACTION_LABEL,
        id: "transactionType",
        size: 200,
      }),
      columnHelper.display({
        cell: ({ row }) => (
          <span className="flex flex-row gap-1">
            {row.original.initialQuantity !== undefined &&
              row.original.initialQuantity !== row.original.finalQuantity && (
                <>
                  {row.original.initialQuantity} <ArrowRightIcon />
                </>
              )}
            {row.original.finalQuantity}
          </span>
        ),
        header: STOCK_LABEL,
        id: "stock",
        size: 120,
        meta: { dataType: CellDataType.Number },
      }),
      columnHelper.display({
        cell: ({ row }) =>
          formatDate(
            row.original.transaction.__typename === "DeliveryNoteLine"
              ? row.original.transaction.deliveryNote.createdAt
              : row.original.transaction.date,
            DateFormat.Datetime,
          ),
        header: DATE_LABEL,
        id: "date",
        size: DEFAULT_DATETIME_COLUMN_SIZE,
      }),
      columnHelper.display({
        cell: ({ row }) => <TransactionOperationDisplay transaction={row.original.transaction} />,
        header: ORIGIN_LABEL,
        id: "origin",
        size: 380,
      }),
    ],
    [],
  );

  return (
    <BaseTable
      testId="table-part-transactions"
      columns={columns}
      rows={rows}
      state={state}
      onStateChange={setState}
      defaultState={defaultState}
      skeletonRowsCount={3}
      {...props}
    />
  );
}

function TransactionTypeDisplay({ transaction }: { transaction: TPartStockTransaction }) {
  switch (transaction.__typename) {
    case "PartProduction":
      return `Fabricados ${transaction.quantity} artículos`;
    case "DeliveryNoteLine":
      return transaction.quantity < 0
        ? `Devueltos ${-transaction.quantity} artículos`
        : `Servidos ${transaction.quantity} artículos`;
    case "PartStock":
      return PART_TRANSACTION_STOCK_UPDATE_LABEL;
    default:
      return UNKNOWN_LABEL;
  }
}

function TransactionOperationDisplay({ transaction }: { transaction: TPartStockTransaction }) {
  switch (transaction.__typename) {
    case "PartProduction":
      return (
        <ButtonLink to="/production-order/$id" params={{ id: transaction.productionOrder.id }}>
          Orden de producción {transaction.productionOrder.id}
        </ButtonLink>
      );
    case "DeliveryNoteLine":
      return (
        <span className="flex flex-row gap-2">
          <ButtonLink to="/delivery-note/$id" params={{ id: transaction.deliveryNote.id }}>
            Albarán {transaction.deliveryNote.id}
          </ButtonLink>
          {transaction.sellOrderLine?.sellOrder && (
            <ButtonLink to="/sell-order/$id" params={{ id: transaction.sellOrderLine.sellOrder.id }}>
              Pedido {transaction.sellOrderLine.sellOrder.clientReference ?? transaction.sellOrderLine.sellOrder.id}
            </ButtonLink>
          )}
        </span>
      );
    case "PartStock":
      return PART_TRANSACTION_MANUAL_UPDATE_LABEL;
    default:
      return "";
  }
}
