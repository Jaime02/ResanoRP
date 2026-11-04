import { LoaderIcon, PrinterIcon } from "lucide-react";
import { useMemo, useState } from "react";

import DialogBlueprintViewer from "@/components/dialog/blueprint-viewer";
import type { PublicBaseTableProps } from "@/components/table/base-table";
import BaseTable from "@/components/table/base-table";
import {
  DEFAULT_CLIENT_COLUMN_SIZE,
  DEFAULT_DATE_COLUMN_SIZE,
  DEFAULT_SELL_ORDER_COLUMN_SIZE,
  DEFAULT_DESCRIPTION_COLUMN_SIZE,
  DEFAULT_REFERENCE_COLUMN_SIZE,
  createTableColumnHelper,
} from "@/components/table/column-helper";
import { TableCellClientName } from "@/components/table/table-cell-client-name";
import TooltipPartReferences from "@/components/tooltip/part-references";
import { Button } from "@/components/ui/button";
import { ButtonCopyLayout } from "@/components/ui/button-copy";
import ButtonLink from "@/components/ui/button-link";
import { ModelActions } from "@/components/ui/model-actions";
import { useAppContext } from "@/contexts/app-context";
import { formatDate } from "@/lib/formatters";
import { BLUEPRINTS_OF_PART_TITLE } from "@/messages/blueprint";
import {
  ACTIONS_LABEL,
  CLIENT_LABEL,
  DATE_LABEL,
  DESCRIPTION_LABEL,
  PART_LABEL,
  QUANTITY_LABEL,
  REFERENCE_LABEL,
} from "@/messages/common";
import { LABEL_PRINTED_MESSAGE, NO_PRODUCTIONS_MESSAGE, PRODUCTION_ORDER_LABEL } from "@/messages/production-order";
import { SELL_ORDER_LABEL } from "@/messages/sell-order";
import type { TPartProductionHistory } from "@/queries/part-production";
import { useQueryPartProductionHistory } from "@/queries/part-production";
import type { TPartProductionFilters, TTablePartProductionState } from "@/schemas/part-production";
import trpc from "@/trpc/trpc-client";
import { CellDataType } from "@/types";
import { MACHINE_PRODUCTION_HISTORY_PAGE_SIZE } from "@/types/machine";

const DEFAULT_STATE: TTablePartProductionState = { sorts: [{ desc: true, id: "date" }] };

type TableMachineProductionHistoryProps = PublicBaseTableProps<TPartProductionHistory, TTablePartProductionState> & {
  machineId: number | undefined;
};

const columnHelper = createTableColumnHelper<TPartProductionHistory>();

const columns = [
  columnHelper.display({
    cell: ({ row }) => {
      const productionOrder = row.original.productionOrder;
      return (
        <ButtonCopyLayout value={productionOrder?.sellOrderLine?.partReference?.reference}>
          {!productionOrder?.sellOrderLine && (
            <TooltipPartReferences references={productionOrder?.part?.references ?? []} />
          )}
          <ButtonLink to="/part/$id" params={{ id: productionOrder?.part?.id }} target="_blank">
            {productionOrder?.sellOrderLine?.partReference?.reference ?? PART_LABEL}
          </ButtonLink>
        </ButtonCopyLayout>
      );
    },
    header: REFERENCE_LABEL,
    size: DEFAULT_REFERENCE_COLUMN_SIZE,
    enableResizing: true,
  }),
  columnHelper.display({
    cell: ({ row }) => row.original.productionOrder?.part?.description,
    header: DESCRIPTION_LABEL,
    size: DEFAULT_DESCRIPTION_COLUMN_SIZE,
    enableResizing: true,
  }),
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
    size: DEFAULT_CLIENT_COLUMN_SIZE,
    enableResizing: true,
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
  columnHelper.display({
    cell: ({ row }) => {
      const productionOrder = row.original.productionOrder;
      return (
        <ModelActions
          extraComponentsStart={
            <>
              <DialogBlueprintViewer
                title={`${BLUEPRINTS_OF_PART_TITLE} "${productionOrder?.sellOrderLine?.partReference?.reference ?? productionOrder?.part?.description}"`}
                blueprints={productionOrder?.part?.blueprints}
              />
              <ButtonPrintPartProductionTag
                productionOrderId={row.original.productionOrderId}
                partQuantity={row.original.quantity}
              />
            </>
          }
        />
      );
    },
    header: ACTIONS_LABEL,
    id: "actions",
  }),
];

function ButtonPrintPartProductionTag({
  productionOrderId,
  partQuantity,
}: {
  productionOrderId: number;
  partQuantity: number;
}) {
  const { showToastOnTRPCMutation } = useAppContext();
  const [isPrintingTag, setIsPrintingTag] = useState(false);

  return (
    <Button
      testId="button-print-tag-part-production"
      size="icon"
      disabled={isPrintingTag || partQuantity <= 0}
      onClick={async () => {
        setIsPrintingTag(true);
        await showToastOnTRPCMutation({
          mutation: trpc.productionOrder.printTag.mutate({ partQuantity, productionOrderId }),
          onSuccess: { title: LABEL_PRINTED_MESSAGE },
        });
        setIsPrintingTag(false);
      }}
    >
      {isPrintingTag ? <LoaderIcon className="animate-spin" /> : <PrinterIcon />}
    </Button>
  );
}

export default function TableMachineProductionHistory({
  testId = "table-machine-production-history",
  machineId,
  state,
  ...props
}: TableMachineProductionHistoryProps) {
  const filters = useMemo<TPartProductionFilters>(
    // First, as the first filter of an id is the one applied, so the URL can not show other Máquinas
    () => [{ id: "machineId", value: machineId ?? null }, ...(state?.filters ?? [])],
    [state?.filters, machineId],
  );
  const pagination =
    state?.pagination === null ? null : { pageSize: MACHINE_PRODUCTION_HISTORY_PAGE_SIZE, ...state?.pagination };

  const {
    data: partProductions,
    isLoading,
    rowCount,
  } = useQueryPartProductionHistory({
    skip: machineId === undefined,
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
      isLoading={isLoading}
      noDataMessage={NO_PRODUCTIONS_MESSAGE}
      {...props}
    />
  );
}
