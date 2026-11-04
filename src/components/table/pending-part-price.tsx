import { Fragment, useMemo } from "react";

import type { PublicBaseTableProps } from "@/components/table/base-table";
import BaseTable from "@/components/table/base-table";
import CellVerticalList from "@/components/table/cell-vertical-list";
import { createTableColumnHelper } from "@/components/table/column-helper";
import ButtonLink from "@/components/ui/button-link";
import { ModelActions } from "@/components/ui/model-actions";
import { formatDate } from "@/lib/formatters";
import { ACTIONS_LABEL, CLIENT_LABEL, DATE_LABEL, PART_LABEL } from "@/messages/common";
import {
  CALCULATE_LABEL,
  NO_PENDING_PART_PRICES_MESSAGE,
  PENDING_PART_PRICES_TITLE,
  QUANTITIES_LABEL,
} from "@/messages/part-price";
import { useQueryPendingPartPrices } from "@/queries/part-price";
import type { TPendingPartPrice } from "@/queries/part-price";
import type { TTablePendingPartPriceState } from "@/schemas/part-price";
import { CellDataType } from "@/types";

const DEFAULT_STATE: TTablePendingPartPriceState = { sorts: [{ desc: false, id: "description" }] };

type TablePendingPartPriceProps = PublicBaseTableProps<TPendingPartPrice, TTablePendingPartPriceState>;

const columnHelper = createTableColumnHelper<TPendingPartPrice>();

export default function TablePendingPartPrice({ state, ...props }: TablePendingPartPriceProps) {
  const { data: pendingPartPrices, isLoading } = useQueryPendingPartPrices({
    filters: state?.filters ?? DEFAULT_STATE.filters,
    sorts: state?.sorts ?? DEFAULT_STATE.sorts,
  });

  const columns = useMemo(
    () => [
      columnHelper.accessor("description", {
        cell: ({ row }) => (
          <ButtonLink to="/part/$id" params={{ id: row.original.id }} target="_blank">
            {row.original.description}
          </ButtonLink>
        ),
        enableColumnFilter: true,
        enableSorting: true,
        header: PART_LABEL,
        meta: { dataType: CellDataType.String },
      }),
      columnHelper.accessor((row) => row.pendingPartPrices.map((partPrice) => partPrice.quantity).join(", "), {
        enableColumnFilter: true,
        header: QUANTITIES_LABEL,
        id: "quantity",
        meta: { dataType: CellDataType.Number },
      }),
      columnHelper.accessor((row) => row.pendingPartPrices.map((partPrice) => partPrice.client?.name).join(", "), {
        cell: ({ row }) => (
          <CellVerticalList>
            {row.original.pendingPartPrices
              .filter((partPrice) => partPrice.client !== undefined)
              .map((partPrice) => (
                <Fragment key={partPrice.id}>{partPrice.client?.name}</Fragment>
              ))}
          </CellVerticalList>
        ),
        enableColumnFilter: true,
        header: CLIENT_LABEL,
        id: "clientName",
        meta: { dataType: CellDataType.String },
      }),
      columnHelper.accessor((row) => row.pendingPartPrices.at(0)?.createdAt, {
        cell: ({ row }) => (
          <CellVerticalList>
            {row.original.pendingPartPrices.map((partPrice) => (
              <Fragment key={partPrice.id}>{formatDate(partPrice.createdAt)}</Fragment>
            ))}
          </CellVerticalList>
        ),
        enableColumnFilter: true,
        enableSorting: true,
        header: DATE_LABEL,
        id: "createdAt",
        meta: { dataType: CellDataType.Date },
      }),
      columnHelper.display({
        cell: ({ row }) => (
          <ModelActions
            extraComponentsStart={
              <ButtonLink
                testId="button-link-calculate-part-price"
                to="/price-calculator/$partId"
                params={{ partId: row.original.id }}
              >
                {CALCULATE_LABEL}
              </ButtonLink>
            }
          />
        ),
        header: ACTIONS_LABEL,
        id: "actions",
      }),
    ],
    [],
  );

  return (
    <BaseTable
      testId="table-pending-part-price"
      title={PENDING_PART_PRICES_TITLE}
      columns={columns}
      rows={pendingPartPrices}
      state={state}
      defaultState={DEFAULT_STATE}
      noDataMessage={NO_PENDING_PART_PRICES_MESSAGE}
      skeletonRowsCount={3}
      {...props}
      isLoading={props.isLoading === true || isLoading}
    />
  );
}
