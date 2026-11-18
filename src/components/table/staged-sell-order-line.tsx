import { useNavigate } from "@tanstack/react-router";
import { MinusIcon, TagIcon } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";

import DialogBlueprintViewer from "@/components/dialog/blueprint-viewer";
import DialogPartTag from "@/components/dialog/delivery-note-line-tag";
import type { PublicBaseTableProps } from "@/components/table/base-table";
import BaseTable from "@/components/table/base-table";
import {
  DEFAULT_DESCRIPTION_COLUMN_SIZE,
  DEFAULT_REFERENCE_COLUMN_SIZE,
  DEFAULT_SELL_ORDER_COLUMN_SIZE,
  THREE_BUTTONS_ACTIONS_COLUMN_SIZE,
  createTableColumnHelper,
} from "@/components/table/column-helper";
import { Button } from "@/components/ui/button";
import ButtonLink from "@/components/ui/button-link";
import { ModelActions } from "@/components/ui/model-actions";
import type { useStageSellOrderLinesForm } from "@/form/hooks/use-stage-sell-order-lines";
import { BLUEPRINTS_OF_PART_TITLE } from "@/messages/blueprint";
import { ACTIONS_LABEL, DESCRIPTION_LABEL, QUANTITY_LABEL, REFERENCE_LABEL } from "@/messages/common";
import { NO_SELECTED_PARTS_MESSAGE, SELL_ORDER_LABEL } from "@/messages/sell-order";
import type { TTableSellOrderLineState } from "@/schemas/sell-order-line";
import { CellDataType, TableMode } from "@/types";

type TStageSellOrderLinesForm = ReturnType<typeof useStageSellOrderLinesForm>;
type TStagedPartRow = TStageSellOrderLinesForm["stagedPartRows"][number];

interface TableStagedOrderLineProps
  extends
    PublicBaseTableProps<TStagedPartRow, TTableSellOrderLineState>,
    Pick<
      TStageSellOrderLinesForm,
      "stagedPartRows" | "stagedSellOrderLines" | "unstageSellOrderLines" | "updateStagedGroupQuantity"
    > {
  printTagSellOrderLineId?: number;
}

const columnHelper = createTableColumnHelper<TStagedPartRow>();

export function TableStagedOrderLine({
  isLoading,
  stagedPartRows,
  stagedSellOrderLines,
  unstageSellOrderLines,
  updateStagedGroupQuantity,
  printTagSellOrderLineId,
  ...props
}: TableStagedOrderLineProps) {
  const navigate = useNavigate();

  const printTagRow = stagedPartRows.find((row) => row.id === printTagSellOrderLineId);
  const printTagSellOrderLines = useMemo(() => {
    const lines = printTagRow?.lines
      .filter((line) => line.quantity > 0)
      .map((line) => ({ id: line.id, quantity: line.quantity }));
    return lines !== undefined && lines.length > 0 ? lines : undefined;
  }, [printTagRow]);

  const columns = useMemo(
    () => [
      columnHelper.display({
        cell: (info) => info.row.index + 1,
        id: "id",
      }),
      columnHelper.display({
        cell: ({ row }) => (
          <div className="flex flex-row flex-wrap gap-1">
            {[...new Map(row.original.lines.map((line) => [line.sellOrder.id, line.sellOrder])).values()].map(
              (sellOrder) => (
                <ButtonLink key={sellOrder.id} to="/sell-order/$id" params={{ id: sellOrder.id }} target="_blank">
                  {sellOrder.clientReference ?? String(sellOrder.id)}
                </ButtonLink>
              ),
            )}
          </div>
        ),
        header: SELL_ORDER_LABEL,
        id: "sell-orders",
        size: DEFAULT_SELL_ORDER_COLUMN_SIZE,
      }),
      columnHelper.display({
        // The Pedidos of a part may name it by different references
        cell: ({ row }) => (
          <div className="flex flex-row flex-wrap gap-1">
            {[
              ...new Map(
                row.original.lines.flatMap((line) =>
                  line.partReference ? [[line.partReference.id, line.partReference] as const] : [],
                ),
              ).values(),
            ].map((partReference) => (
              <ButtonLink key={partReference.id} to="/part/$id" params={{ id: partReference.part?.id }} target="_blank">
                {partReference.reference}
              </ButtonLink>
            ))}
          </div>
        ),
        header: REFERENCE_LABEL,
        id: "part-reference",
        size: DEFAULT_REFERENCE_COLUMN_SIZE,
      }),
      columnHelper.accessor(
        (stagedPartRow) =>
          stagedPartRow.lines[0].partReference?.part?.description ?? stagedPartRow.lines[0].description,
        {
          header: DESCRIPTION_LABEL,
          size: DEFAULT_DESCRIPTION_COLUMN_SIZE,
        },
      ),
      columnHelper.accessor("quantity", {
        header: QUANTITY_LABEL,
        id: "quantity",
        meta: { dataType: CellDataType.Number, editable: true, min: -Infinity },
      }),
      columnHelper.display({
        cell: ({ row }) => (
          <ModelActions
            extraComponentsStart={
              <>
                <DialogBlueprintViewer
                  title={`${BLUEPRINTS_OF_PART_TITLE} ${row.original.lines[0].partReference?.part?.description ?? ""}`}
                  blueprints={row.original.lines[0].partReference?.part?.blueprints}
                />
                <Button
                  testId="button-print-tag"
                  // Negated so a total left as NaN by a lone minus sign is disabled too
                  disabled={isLoading === true || !(row.original.quantity > 0)}
                  size="icon"
                  variant="success"
                  onClick={async () =>
                    navigate({
                      replace: true,
                      search: (prev) => ({
                        ...prev,
                        printTagSellOrderLineId: row.original.id,
                      }),
                      to: ".",
                    })
                  }
                >
                  <TagIcon />
                </Button>
                <Button
                  testId="button-unstage"
                  disabled={isLoading}
                  variant="destructive"
                  size="icon"
                  onClick={async () => unstageSellOrderLines(row.original.lines.map((line) => line.id))}
                >
                  <MinusIcon />
                </Button>
              </>
            }
          />
        ),
        header: ACTIONS_LABEL,
        id: "actions",
        size: THREE_BUTTONS_ACTIONS_COLUMN_SIZE,
      }),
    ],
    [isLoading, unstageSellOrderLines, navigate],
  );

  const previousStagedSellOrderLinesIds = useRef(new Set<number>());

  useEffect(() => {
    if (stagedSellOrderLines === undefined) {
      return;
    }
    const newId = stagedSellOrderLines.find((line) => !previousStagedSellOrderLinesIds.current.has(line.id))?.id;
    previousStagedSellOrderLinesIds.current = new Set(stagedSellOrderLines.map((line) => line.id));
    const newRowId = stagedPartRows.find((row) => row.lines.some((line) => line.id === newId))?.id;
    if (newRowId === undefined) {
      return;
    }
    // Focus the quantity input of the part the newly staged sell order line was added to
    const quantityInput = document.querySelector(
      `[data-testid="table-staged-sell-order-lines"] tr[data-testid="${newRowId}"] [data-testid="quantity"] input`,
    );
    if (quantityInput instanceof HTMLInputElement) {
      quantityInput.focus();
    }
  }, [stagedSellOrderLines, stagedPartRows]);

  return (
    <>
      <BaseTable
        testId="table-staged-sell-order-lines"
        tableMode={TableMode.Editable}
        columns={columns}
        rows={stagedPartRows}
        state={{ pagination: null }}
        disabledMessage={
          stagedSellOrderLines === undefined || stagedSellOrderLines.length === 0
            ? NO_SELECTED_PARTS_MESSAGE
            : undefined
        }
        noDataMessage={NO_SELECTED_PARTS_MESSAGE}
        onRowChange={async (cell, value) => {
          if (cell.column.id === "quantity") {
            // Sync the edited quantity to the staged sell order lines so the form validates it as it is typed
            await updateStagedGroupQuantity(
              cell.row.original.lines.map((line) => line.id),
              value as number,
            );
          }
        }}
        isLoading={isLoading}
        {...props}
      />
      <DialogPartTag
        printTagSellOrderLines={printTagSellOrderLines}
        partQuantity={printTagSellOrderLines?.reduce((total, line) => total + line.quantity, 0)}
      />
    </>
  );
}
