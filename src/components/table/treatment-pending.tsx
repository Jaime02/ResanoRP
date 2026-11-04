import { CheckIcon, PlusIcon, SendIcon } from "lucide-react";
import { useMemo, useState } from "react";

import treatmentShipmentCollection from "@/collections/treatment-shipment";
import DialogBlueprintViewer from "@/components/dialog/blueprint-viewer";
import DialogSendPartTreatment from "@/components/dialog/send-part-treatment";
import BaseTable from "@/components/table/base-table";
import {
  DEFAULT_CLIENT_COLUMN_SIZE,
  DEFAULT_DESCRIPTION_COLUMN_SIZE,
  DEFAULT_REFERENCE_COLUMN_SIZE,
  createTableColumnHelper,
} from "@/components/table/column-helper";
import { TableCellClientName } from "@/components/table/table-cell-client-name";
import TooltipPartReferences from "@/components/tooltip/part-references";
import { Button } from "@/components/ui/button";
import ButtonLink from "@/components/ui/button-link";
import { ModelActions } from "@/components/ui/model-actions";
import { useAppContext } from "@/contexts/app-context";
import {
  ACTIONS_LABEL,
  CLIENT_LABEL,
  COATING_LABEL,
  DESCRIPTION_LABEL,
  PART_LABEL,
  PENDING_LABEL,
  REFERENCE_LABEL,
} from "@/messages/common";
import { ORDER_LABEL } from "@/messages/production-order";
import {
  NO_PARTS_PENDING_TO_BE_DELIVERED_TO_TREATMENT_MESSAGE,
  PARTS_SENT_TO_TREATMENT_MESSAGE,
  PENDING_TO_SEND_TITLE,
  PRODUCED_QUANTITY_LABEL,
  SEND_LABEL,
  SEND_TO_TREATMENT_LABEL,
  SENT_QUANTITY_LABEL,
} from "@/messages/treatment";
import type { TTreatmentPendingProductionOrder } from "@/queries/treatment";
import { useQueryTreatmentPendingProductionOrders } from "@/queries/treatment";
import type { TTableTreatmentPendingState } from "@/schemas/treatment";
import trpc from "@/trpc/trpc-client";
import { CellDataType, TableMode } from "@/types";

type TTreatmentPendingRow = TTreatmentPendingProductionOrder & { sendQuantity: number | null };

const columnHelper = createTableColumnHelper<TTreatmentPendingRow>();

const isSendQuantityFilled = (row: TTreatmentPendingRow) => (row.sendQuantity ?? 0) >= row.unsentQuantity;

export default function TableTreatmentPending({ state }: { state?: TTableTreatmentPendingState }) {
  const { showToastOnTRPCMutation } = useAppContext();
  const { data: pendingProductionOrders, isLoading } = useQueryTreatmentPendingProductionOrders();
  const [sendQuantities, setSendQuantities] = useState(new Map<number, number | null>());
  const [isSending, setIsSending] = useState(false);

  const columns = useMemo(
    () => [
      columnHelper.display({
        cell: ({ row }) => (
          <ButtonLink to="/production-order/$id" params={{ id: row.original.id }} target="_blank">
            {row.original.id}
          </ButtonLink>
        ),
        header: ORDER_LABEL,
        id: "productionOrderId",
      }),
      columnHelper.display({
        cell: ({ row }) => (
          <div className="flex flex-row items-center gap-1">
            {!row.original.sellOrderLine && <TooltipPartReferences references={row.original.part?.references ?? []} />}
            <ButtonLink to="/part/$id" params={{ id: row.original.part?.id }} target="_blank">
              {row.original.sellOrderLine?.partReference?.reference ?? PART_LABEL}
            </ButtonLink>
          </div>
        ),
        header: REFERENCE_LABEL,
        id: "reference",
        enableResizing: true,
        size: DEFAULT_REFERENCE_COLUMN_SIZE,
      }),
      columnHelper.display({
        cell: ({ row }) => <TableCellClientName client={row.original.sellOrderLine?.sellOrder?.client} />,
        header: CLIENT_LABEL,
        id: "client",
        enableResizing: true,
        size: DEFAULT_CLIENT_COLUMN_SIZE,
      }),
      columnHelper.accessor((row) => row.part?.description, {
        header: DESCRIPTION_LABEL,
        id: "description",
        enableResizing: true,
        size: DEFAULT_DESCRIPTION_COLUMN_SIZE,
      }),
      columnHelper.accessor((row) => row.part?.coating?.name, { header: COATING_LABEL, id: "coating" }),
      columnHelper.accessor("producedQuantity", { header: PRODUCED_QUANTITY_LABEL, id: "producedQuantity" }),
      columnHelper.accessor("sentQuantity", { header: SENT_QUANTITY_LABEL, id: "sentQuantity" }),
      columnHelper.accessor("unsentQuantity", { header: PENDING_LABEL, id: "unsentQuantity" }),
      columnHelper.accessor("sendQuantity", {
        header: SEND_LABEL,
        id: "sendQuantity",
        meta: { dataType: CellDataType.Number, editable: true },
      }),
      columnHelper.display({
        cell: ({ row }) => (
          <ModelActions
            extraComponentsStart={
              <>
                <DialogBlueprintViewer
                  title={`Planos del Artículo ${row.original.part?.description ?? ""}`}
                  blueprints={row.original.part?.blueprints}
                />
                <Button
                  testId="button-send-all-pending"
                  variant="success"
                  size="icon"
                  clickable={!isSendQuantityFilled(row.original)}
                  onClick={() => {
                    if (!isSendQuantityFilled(row.original)) {
                      setSendQuantities((previous) =>
                        new Map(previous).set(row.original.id, row.original.unsentQuantity),
                      );
                    }
                  }}
                >
                  {isSendQuantityFilled(row.original) ? <CheckIcon /> : <PlusIcon />}
                </Button>
              </>
            }
          />
        ),
        header: ACTIONS_LABEL,
        id: "actions",
      }),
    ],
    [],
  );

  const rows = useMemo(
    () =>
      pendingProductionOrders.map((productionOrder) => ({
        ...productionOrder,
        sendQuantity: sendQuantities.get(productionOrder.id) ?? null,
      })),
    [pendingProductionOrders, sendQuantities],
  );
  const items = rows.flatMap((row) =>
    row.sendQuantity !== null && row.sendQuantity > 0
      ? [{ productionOrderId: row.id, quantity: row.sendQuantity }]
      : [],
  );

  return (
    <BaseTable
      testId="table-treatment-pending"
      title={PENDING_TO_SEND_TITLE}
      tableMode={TableMode.Editable}
      columns={columns}
      rows={rows}
      state={state}
      isLoading={isLoading}
      noDataMessage={NO_PARTS_PENDING_TO_BE_DELIVERED_TO_TREATMENT_MESSAGE}
      onRowChange={(cell, value) =>
        setSendQuantities((previous) => new Map(previous).set(cell.row.original.id, value as number | null))
      }
      headerExtraComponents={
        <>
          <DialogSendPartTreatment />
          <Button
            testId="button-send-treatment"
            variant="success"
            disabled={items.length === 0 || isSending}
            onClick={async () => {
              setIsSending(true);
              const result = await showToastOnTRPCMutation({
                mutation: trpc.treatment.send.mutate(items),
                collection: treatmentShipmentCollection,
                onSuccess: { title: PARTS_SENT_TO_TREATMENT_MESSAGE },
              });
              if (result !== null) {
                setSendQuantities(new Map());
              }
              setIsSending(false);
            }}
          >
            <SendIcon /> {SEND_TO_TREATMENT_LABEL}
          </Button>
        </>
      }
    />
  );
}
