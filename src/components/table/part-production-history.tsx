import { useMemo, useState } from "react";

import type { PublicBaseTableProps } from "@/components/table/base-table";
import BaseTable from "@/components/table/base-table";
import {
  DEFAULT_CLIENT_COLUMN_SIZE,
  DEFAULT_DATE_COLUMN_SIZE,
  DEFAULT_MACHINE_COLUMN_SIZE,
  DEFAULT_SELL_ORDER_COLUMN_SIZE,
  createTableColumnHelper,
} from "@/components/table/column-helper";
import { TableCellClientName } from "@/components/table/table-cell-client-name";
import ButtonLink from "@/components/ui/button-link";
import { formatDate } from "@/lib/formatters";
import { CLIENT_LABEL, DATE_LABEL, MACHINE_LABEL, QUANTITY_LABEL } from "@/messages/common";
import { PRODUCTION_ORDER_LABEL } from "@/messages/production-order";
import { SELL_ORDER_LABEL } from "@/messages/sell-order";
import type { TPartProductionHistory } from "@/queries/part-production";
import { useQueryPartProductionHistory } from "@/queries/part-production";
import type { TTableState } from "@/schemas";
import type { TPartProductionFilters, TTablePartProductionState } from "@/schemas/part-production";
import { tablePartProductionStateSchema } from "@/schemas/part-production";
import { CellDataType } from "@/types";
import { PART_PRODUCTION_HISTORY_PAGE_SIZE } from "@/types/part-production";

const DEFAULT_STATE: TTablePartProductionState = { sorts: [{ desc: true, id: "date" }] };

type TablePartProductionProps = Omit<
  PublicBaseTableProps<TPartProductionHistory, TTablePartProductionState>,
  "state" | "onStateChange"
> & {
  partId: number | undefined;
  skipQueries?: boolean;
};

const columnHelper = createTableColumnHelper<TPartProductionHistory>();

const columns = [
  columnHelper.display({
    cell: ({ row }) => (
      <ButtonLink to="/production-order/$id" params={{ id: row.original.productionOrder?.id }} target="_blank">
        {row.original.productionOrder?.id}
      </ButtonLink>
    ),
    header: PRODUCTION_ORDER_LABEL,
  }),
  columnHelper.display({
    cell: ({ row }) => {
      const sellOrder = row.original.productionOrder?.sellOrderLine?.sellOrder;
      return (
        sellOrder && (
          <ButtonLink to="/sell-order/$id" params={{ id: sellOrder.id }} target="_blank">
            {sellOrder.clientReference ?? String(sellOrder.id)}
          </ButtonLink>
        )
      );
    },
    header: SELL_ORDER_LABEL,
    size: DEFAULT_SELL_ORDER_COLUMN_SIZE,
    enableResizing: true,
  }),
  columnHelper.display({
    cell: ({ row }) => <TableCellClientName client={row.original.productionOrder?.sellOrderLine?.sellOrder?.client} />,
    header: CLIENT_LABEL,
    enableResizing: true,
    size: DEFAULT_CLIENT_COLUMN_SIZE,
  }),
  columnHelper.accessor((partProduction) => partProduction.quantity, {
    header: QUANTITY_LABEL,
    meta: { dataType: CellDataType.Number },
  }),
  columnHelper.accessor("date", {
    cell: ({ row }) => formatDate(row.original.date),
    header: DATE_LABEL,
    size: DEFAULT_DATE_COLUMN_SIZE,
    meta: { dataType: CellDataType.Date, filterFieldName: "date" },
  }),
  columnHelper.accessor("machine", {
    cell: ({ row }) => (
      <ButtonLink to="/machine/$id" params={{ id: row.original.machine?.id }} target="_blank">
        {row.original.machine?.name}
      </ButtonLink>
    ),
    header: MACHINE_LABEL,
    size: DEFAULT_MACHINE_COLUMN_SIZE,
  }),
];

export default function TablePartProductionHistory({
  testId = "table-part-production-history",
  partId,
  skipQueries,
  ...props
}: TablePartProductionProps) {
  const [tableState, setTableState] = useState<TTableState | undefined>();
  const state = useMemo(() => tablePartProductionStateSchema.safeParse(tableState).data, [tableState]);

  const filters = useMemo<TPartProductionFilters>(
    () => [...(state?.filters ?? []), { id: "partId", value: partId ?? null }],
    [state?.filters, partId],
  );
  const pagination =
    state?.pagination === null ? null : { pageSize: PART_PRODUCTION_HISTORY_PAGE_SIZE, ...state?.pagination };

  const {
    data: partProductions,
    isLoading,
    rowCount,
  } = useQueryPartProductionHistory({
    skip: skipQueries === true || partId === undefined,
    filters,
    pagination,
    sorts: state?.sorts,
  });

  return (
    <BaseTable
      testId={testId}
      columns={columns}
      rows={partProductions}
      rowCount={rowCount}
      defaultState={DEFAULT_STATE}
      state={{ ...state, pagination }}
      isLoading={isLoading || skipQueries === true}
      onStateChange={setTableState}
      {...props}
    />
  );
}
