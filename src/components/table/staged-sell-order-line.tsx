import { useNavigate } from "@tanstack/react-router";
import { MinusIcon, TagIcon } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";

import DialogPartTag from "@/components/dialog/delivery-note-line-tag";
import type { PublicBaseTableProps } from "@/components/table/base-table";
import BaseTable from "@/components/table/base-table";
import { createTableColumnHelper } from "@/components/table/column-helper";
import { Button } from "@/components/ui/button";
import ButtonLink from "@/components/ui/button-link";
import { ModelActions } from "@/components/ui/model-actions";
import type { useStageSellOrderLinesForm } from "@/form/hooks/use-stage-sell-order-lines";
import { ACTIONS_LABEL, DESCRIPTION_LABEL, QUANTITY_LABEL, REFERENCE_LABEL } from "@/messages/common";
import { NO_SELECTED_PARTS_MESSAGE } from "@/messages/sell-order";
import type { TStagedSellOrderLineTableRow } from "@/queries/sell-order-line";
import { useQueryStagedSellOrderLines } from "@/queries/sell-order-line";
import type { TStagedSellOrderLine } from "@/schemas/delivery-note";
import type { TTableSellOrderLineState } from "@/schemas/sell-order-line";
import { CellDataType, TableMode } from "@/types";

interface TableStagedOrderLineProps
  extends
    PublicBaseTableProps<TStagedSellOrderLineTableRow, TTableSellOrderLineState>,
    Pick<ReturnType<typeof useStageSellOrderLinesForm>, "unstageSellOrderLine" | "updateStagedSellOrderLineQuantity"> {
  printTagSellOrderLineId?: number;
  stagedSellOrderLines?: Array<TStagedSellOrderLine>;
}

const columnHelper = createTableColumnHelper<TStagedSellOrderLineTableRow>();

export function TableStagedOrderLine({
  isLoading,
  unstageSellOrderLine,
  updateStagedSellOrderLineQuantity,
  stagedSellOrderLines,
  printTagSellOrderLineId,
  ...props
}: TableStagedOrderLineProps) {
  const navigate = useNavigate();

  const { data: stagedSellOrderLinesData } = useQueryStagedSellOrderLines(stagedSellOrderLines);

  const printTagPartQuantity = stagedSellOrderLinesData.find(
    (stagedSellOrderLine) => stagedSellOrderLine.id === printTagSellOrderLineId,
  )?.quantity;

  const columns = useMemo(
    () => [
      columnHelper.display({
        cell: (info) => info.row.index + 1,
        id: "id",
      }),
      columnHelper.display({
        cell: ({ row }) =>
          row.original.partReference && (
            <ButtonLink to="/part/$id" params={{ id: row.original.partReference.part?.id }} target="_blank">
              {row.original.partReference.reference}
            </ButtonLink>
          ),
        header: REFERENCE_LABEL,
        id: "part-reference",
      }),
      columnHelper.accessor(
        (stagedSellOrderLine) =>
          stagedSellOrderLine.partReference?.part?.description ?? stagedSellOrderLine.description,
        {
          header: DESCRIPTION_LABEL,
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
                <Button
                  testId="button-print-tag"
                  disabled={isLoading === true || row.original.quantity < 0}
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
                  onClick={async () => unstageSellOrderLine(row.original.id)}
                >
                  <MinusIcon />
                </Button>
              </>
            }
          />
        ),
        header: ACTIONS_LABEL,
        id: "actions",
      }),
    ],
    [isLoading, unstageSellOrderLine, navigate],
  );

  const previousStagedSellOrderLinesIds = useRef(new Set());

  useEffect(() => {
    if (stagedSellOrderLines === undefined) {
      return;
    }
    const currentIds = new Set(stagedSellOrderLines.map((line) => line.id));
    const idsChanged =
      currentIds.size !== previousStagedSellOrderLinesIds.current.size ||
      [...currentIds].some((id) => !previousStagedSellOrderLinesIds.current.has(id));

    if (idsChanged) {
      const newIds = stagedSellOrderLines
        .filter((line) => !previousStagedSellOrderLinesIds.current.has(line.id))
        .map((line) => line.id);

      if (newIds.length > 0) {
        // Focus the quantity input of the newly added staged sell order line
        const newId = newIds[0];
        const row = document.querySelector(`[data-testid="table-staged-sell-order-lines"] tr[data-testid="${newId}"]`);
        if (row) {
          const quantityInput = row.querySelector('[data-testid="quantity"] input');
          if (quantityInput instanceof HTMLInputElement) {
            quantityInput.focus();
          }
        }
      }
      previousStagedSellOrderLinesIds.current = currentIds;
    }
  }, [stagedSellOrderLines]);

  return (
    <>
      <BaseTable
        testId="table-staged-sell-order-lines"
        tableMode={TableMode.Editable}
        columns={columns}
        rows={stagedSellOrderLinesData}
        disabledMessage={
          stagedSellOrderLines === undefined || stagedSellOrderLines.length === 0
            ? NO_SELECTED_PARTS_MESSAGE
            : undefined
        }
        noDataMessage={NO_SELECTED_PARTS_MESSAGE}
        onRowChange={async (cell, value) => {
          if (cell.column.id === "quantity") {
            // Sync the edited quantity to the staged sell order line so the form validates it as it is typed
            await updateStagedSellOrderLineQuantity(cell.row.original.id, value as number);
          }
        }}
        isLoading={isLoading}
        {...props}
      />
      <DialogPartTag printTagSellOrderLineId={printTagSellOrderLineId} partQuantity={printTagPartQuantity} />
    </>
  );
}
