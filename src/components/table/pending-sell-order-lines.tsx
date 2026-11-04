import { CheckIcon, PlusIcon } from "lucide-react";
import { useMemo, useState } from "react";

import DialogBlueprintViewer from "@/components/dialog/blueprint-viewer";
import DialogPrintPendingSellOrders from "@/components/dialog/print-pending-sell-orders";
import type { PublicBaseTableProps } from "@/components/table/base-table";
import BaseTable from "@/components/table/base-table";
import { createTableColumnHelper } from "@/components/table/column-helper";
import { TableCellSellOrderLineStatus } from "@/components/table/table-cell-sell-order-line-status";
import { Button } from "@/components/ui/button";
import ButtonCopy from "@/components/ui/button-copy";
import ButtonLink from "@/components/ui/button-link";
import { Checkbox } from "@/components/ui/checkbox";
import { InfoPopoverTrigger } from "@/components/ui/info-popover";
import { Label } from "@/components/ui/label";
import { ModelActions } from "@/components/ui/model-actions";
import { Popover, PopoverContent } from "@/components/ui/popover";
import { useAppContext } from "@/contexts/app-context";
import type { useStageSellOrderLinesForm } from "@/form/hooks/use-stage-sell-order-lines";
import { tableToClipboard } from "@/lib/clipboard";
import { formatDate } from "@/lib/formatters";
import { computeSellOrderLineStatus, getSellOrderLineStatusDisplay } from "@/lib/sell-order-line";
import {
  DESCRIPTION_LABEL,
  NOTES_LABEL,
  PART_LABEL,
  PENDING_LABEL,
  QUANTITY_LABEL,
  ACTIONS_LABEL,
  REFERENCE_LABEL,
  STATUS_LABEL,
} from "@/messages/common";
import {
  DELIVERY_DATE_COLUMN_LABEL,
  DELIVERY_LABEL,
  NO_PENDING_SELL_ORDERS_MESSAGE,
  PENDING_SELL_ORDERS_COPIED_MESSAGE,
  SELECT_CLIENT_FOR_PENDING_SELL_ORDERS_MESSAGE,
  SELL_ORDER_LABEL,
  SHOW_PREPARED_LINES_LABEL,
} from "@/messages/sell-order";
import { useQueryProductionOrderStatusesBySellOrderLineIds } from "@/queries/production-order";
import type { TPendingSellOrderLine } from "@/queries/sell-order-line";
import type { TTableSellOrderLineState } from "@/schemas/sell-order-line";

const DEFAULT_STATE: TTableSellOrderLineState = { sorts: [{ desc: false, id: "reference" }] };

interface TablePendingSellOrderLinesProps
  extends
    PublicBaseTableProps<TPendingSellOrderLine, TTableSellOrderLineState>,
    Pick<
      ReturnType<typeof useStageSellOrderLinesForm>,
      "pendingSellOrderLines" | "stagedSellOrderLines" | "stageSellOrderLine"
    > {
  clientId: number | null;
}

const columnHelper = createTableColumnHelper<TPendingSellOrderLine>();

function hasLineNotes(lines?: Array<TPendingSellOrderLine>) {
  return (lines ?? []).some((line) => line.notes !== null && line.notes !== "");
}

function ButtonCopyPendingSellOrderLines({ lines }: { lines?: Array<TPendingSellOrderLine> }) {
  const lineIds = useMemo(() => lines?.map((line) => line.id) ?? [], [lines]);
  const { data: productionOrders } = useQueryProductionOrderStatusesBySellOrderLineIds(lineIds);

  const { value, html } = useMemo(() => {
    const hasNotes = hasLineNotes(lines);
    return tableToClipboard(
      [
        "#",
        SELL_ORDER_LABEL,
        STATUS_LABEL,
        PART_LABEL,
        DESCRIPTION_LABEL,
        QUANTITY_LABEL,
        PENDING_LABEL,
        DELIVERY_LABEL,
        ...(hasNotes ? [NOTES_LABEL] : []),
      ],
      (lines ?? []).map((line, index) => [
        index + 1,
        line.sellOrder.clientReference ?? String(line.sellOrder.id),
        getSellOrderLineStatusDisplay(
          computeSellOrderLineStatus({
            sellOrderLine: line,
            sellOrder: line.sellOrder,
            productionOrderStatuses: productionOrders
              .filter((productionOrder) => productionOrder.sellOrderLineId === line.id)
              .map((productionOrder) => productionOrder.status),
          }),
        ).statusText,
        line.partReference?.reference,
        line.partReference?.part?.description ?? line.description,
        line.quantity,
        line.pendingQuantity,
        formatDate(line.requestedDeliveryDate),
        ...(hasNotes ? [line.notes] : []),
      ]),
    );
  }, [lines, productionOrders]);

  return (
    <ButtonCopy
      testId="button-copy-pending-sell-orders"
      size="icon"
      disabled={lines === undefined || lines.length === 0}
      value={value}
      html={html}
      copiedTitle={PENDING_SELL_ORDERS_COPIED_MESSAGE}
    />
  );
}

export function TablePendingSellOrderLines({
  clientId,
  pendingSellOrderLines,
  stagedSellOrderLines,
  stageSellOrderLine,
  ...props
}: TablePendingSellOrderLinesProps) {
  const { isAdmin } = useAppContext();
  const [showStagedLines, setShowStagedLines] = useState(true);
  const visibleSellOrderLines = useMemo(
    () =>
      showStagedLines
        ? pendingSellOrderLines
        : pendingSellOrderLines?.filter(
            (line) => stagedSellOrderLines?.some((staged) => staged.id === line.id) !== true,
          ),
    [pendingSellOrderLines, showStagedLines, stagedSellOrderLines],
  );
  const hasNotes = hasLineNotes(visibleSellOrderLines);
  const columns = useMemo(
    () => [
      columnHelper.display({
        cell: ({ row }) => (
          <div className="flex flex-row items-center gap-1">
            <ButtonLink to="/sell-order/$id" params={{ id: row.original.sellOrder.id }} target="_blank">
              {row.original.sellOrder.clientReference ?? String(row.original.sellOrder.id)}
            </ButtonLink>
            {row.original.sellOrder.notes !== null && row.original.sellOrder.notes !== "" && (
              <Popover>
                <InfoPopoverTrigger data-testid="tooltip-sell-order-notes" />
                <PopoverContent className="whitespace-pre-wrap">{row.original.sellOrder.notes}</PopoverContent>
              </Popover>
            )}
          </div>
        ),
        header: SELL_ORDER_LABEL,
        id: "clientReference",
      }),
      columnHelper.display({
        cell: ({ row }) => (
          <TableCellSellOrderLineStatus sellOrderLine={row.original} sellOrder={row.original.sellOrder} />
        ),
        header: STATUS_LABEL,
        id: "status",
      }),
      columnHelper.display({
        cell: ({ row }) =>
          row.original.partReference && (
            <ButtonLink to="/part/$id" params={{ id: row.original.partReference.part?.id }} target="_blank">
              {row.original.partReference.reference}
            </ButtonLink>
          ),
        header: REFERENCE_LABEL,
        id: "reference",
      }),
      columnHelper.accessor(
        (pendingSellOrderLine) =>
          pendingSellOrderLine.partReference?.part?.description ?? pendingSellOrderLine.description,
        {
          header: DESCRIPTION_LABEL,
          id: "description",
        },
      ),
      columnHelper.accessor("quantity", {
        header: QUANTITY_LABEL,
        id: "quantity",
      }),
      columnHelper.accessor("pendingQuantity", {
        header: PENDING_LABEL,
        id: "pendingQuantity",
      }),
      columnHelper.accessor("requestedDeliveryDate", {
        cell: (info) => formatDate(info.getValue()),
        header: DELIVERY_DATE_COLUMN_LABEL,
        id: "requestedDeliveryDate",
      }),
      ...(hasNotes
        ? [
            columnHelper.accessor("notes", {
              header: NOTES_LABEL,
              id: "notes",
              enableResizing: true,
              size: 200,
            }),
          ]
        : []),
      columnHelper.display({
        cell: ({ row }) => (
          <ModelActions
            extraComponentsStart={
              <>
                <DialogBlueprintViewer
                  title={`Planos del Artículo ${row.original.partReference?.reference}`}
                  blueprints={row.original.partReference?.part?.blueprints}
                />
                <Button
                  testId="button-success"
                  variant="success"
                  size="icon"
                  clickable={stagedSellOrderLines && !stagedSellOrderLines.some((line) => line.id === row.original.id)}
                  onClick={async () => {
                    await stageSellOrderLine(row.original.id, row.original.pendingQuantity);
                  }}
                >
                  {stagedSellOrderLines?.some((line) => line.id === row.original.id) === true ? (
                    <CheckIcon />
                  ) : (
                    <PlusIcon />
                  )}
                </Button>
              </>
            }
          />
        ),
        header: ACTIONS_LABEL,
        id: "actions",
      }),
    ],
    [hasNotes, stageSellOrderLine, stagedSellOrderLines],
  );

  return (
    <BaseTable
      testId="table-pending-sell-orders"
      columns={columns}
      rows={visibleSellOrderLines}
      defaultState={DEFAULT_STATE}
      disabledMessage={clientId === null ? SELECT_CLIENT_FOR_PENDING_SELL_ORDERS_MESSAGE : undefined}
      noDataMessage={NO_PENDING_SELL_ORDERS_MESSAGE}
      skeletonRowsCount={3}
      headerExtraComponents={
        <>
          <div className="flex items-center gap-2">
            <Checkbox
              id="checkbox-show-staged-lines"
              testId="checkbox-show-staged-lines"
              checked={showStagedLines}
              onCheckedChange={setShowStagedLines}
            />
            <Label className="cursor-pointer" onClick={() => setShowStagedLines(!showStagedLines)}>
              {SHOW_PREPARED_LINES_LABEL}
            </Label>
          </div>
          {isAdmin && <ButtonCopyPendingSellOrderLines lines={pendingSellOrderLines} />}
          <DialogPrintPendingSellOrders
            clientId={clientId}
            disabled={pendingSellOrderLines === undefined || pendingSellOrderLines.length === 0}
          />
        </>
      }
      {...props}
    />
  );
}
