import { CheckIcon, PackageCheckIcon, PlusIcon } from "lucide-react";
import { useMemo, useState } from "react";

import treatmentReceptionCollection from "@/collections/treatment-reception";
import treatmentShipmentCollection from "@/collections/treatment-shipment";
import DialogBlueprintViewer from "@/components/dialog/blueprint-viewer";
import BaseTable from "@/components/table/base-table";
import ButtonDeleteModel from "@/components/table/button-delete-model";
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
import { DateFormat, formatDate } from "@/lib/formatters";
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
  DELETE_RECEPTION_MESSAGE,
  DELETE_RECEPTION_TITLE,
  DELETE_SHIPMENT_MESSAGE,
  DELETE_SHIPMENT_TITLE,
  PARTS_RECEIVED_FROM_TREATMENT_MESSAGE,
  RECEIVED_QUANTITY_LABEL,
  RECEPTION_DELETED_MESSAGE,
  SENT_QUANTITY_LABEL,
  SHIPMENT_DELETED_MESSAGE,
  RECEIVE_LABEL,
  RECEPTIONS_LABEL,
  WITHOUT_ORDER_LABEL,
} from "@/messages/treatment";
import type { TTreatmentBatch, TTreatmentBatchShipment } from "@/queries/treatment";
import trpc from "@/trpc/trpc-client";
import { CellDataType, TableMode } from "@/types";

type TTreatmentBatchRow = TTreatmentBatchShipment & { receiveQuantity: number | null };

const columnHelper = createTableColumnHelper<TTreatmentBatchRow>();

const isReceiveQuantityFilled = (row: TTreatmentBatchRow) => (row.receiveQuantity ?? 0) >= row.pendingQuantity;

export default function TableTreatmentBatch({ batch }: { batch: TTreatmentBatch }) {
  const { showToastOnTRPCMutation } = useAppContext();
  const [receiveQuantities, setReceiveQuantities] = useState(new Map<number, number | null>());
  const [isReceiving, setIsReceiving] = useState(false);

  const rows = useMemo(
    () =>
      batch.treatmentShipments.map((treatmentShipment) => ({
        ...treatmentShipment,
        receiveQuantity: receiveQuantities.get(treatmentShipment.id) ?? null,
      })),
    [batch, receiveQuantities],
  );
  const items = rows.flatMap((row) =>
    row.receiveQuantity !== null && row.receiveQuantity > 0
      ? [{ quantity: row.receiveQuantity, treatmentShipmentId: row.id }]
      : [],
  );

  const columns = useMemo(
    () => [
      columnHelper.display({
        cell: ({ row }) =>
          row.original.productionOrderId === null ? (
            WITHOUT_ORDER_LABEL
          ) : (
            <ButtonLink to="/production-order/$id" params={{ id: row.original.productionOrderId }} target="_blank">
              {row.original.productionOrderId}
            </ButtonLink>
          ),
        header: ORDER_LABEL,
        id: "productionOrderId",
      }),
      columnHelper.display({
        cell: ({ row }) => (
          <div className="flex flex-row items-center gap-1">
            {!row.original.productionOrder?.sellOrderLine && (
              <TooltipPartReferences references={row.original.part?.references ?? []} />
            )}
            <ButtonLink to="/part/$id" params={{ id: row.original.part?.id }} target="_blank">
              {row.original.productionOrder?.sellOrderLine?.partReference?.reference ?? PART_LABEL}
            </ButtonLink>
          </div>
        ),
        header: REFERENCE_LABEL,
        id: "reference",
        enableResizing: true,
        size: DEFAULT_REFERENCE_COLUMN_SIZE,
      }),
      columnHelper.display({
        cell: ({ row }) => (
          <TableCellClientName client={row.original.productionOrder?.sellOrderLine?.sellOrder?.client} />
        ),
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
      columnHelper.accessor((row) => row.part?.coating?.name, {
        header: COATING_LABEL,
        id: "coating",
      }),
      columnHelper.accessor("quantity", { header: SENT_QUANTITY_LABEL, id: "quantity" }),
      columnHelper.accessor("receivedQuantity", { header: RECEIVED_QUANTITY_LABEL, id: "receivedQuantity" }),
      columnHelper.accessor("pendingQuantity", { header: PENDING_LABEL, id: "pendingQuantity" }),
      columnHelper.display({
        cell: ({ row }) => (
          <div className="flex flex-col gap-1">
            {row.original.treatmentReceptions.map((treatmentReception) => (
              <div
                key={treatmentReception.id}
                data-testid={`div-treatment-reception-${treatmentReception.id}`}
                className="flex flex-row items-center justify-between gap-2"
              >
                {treatmentReception.quantity} | {formatDate(treatmentReception.receivedAt, DateFormat.Datetime)}
                <ButtonDeleteModel
                  dialogTriggerTestId="button-delete-reception"
                  dialogTitle={DELETE_RECEPTION_TITLE}
                  dialogDescription={DELETE_RECEPTION_MESSAGE}
                  onConfirm={() =>
                    void showToastOnTRPCMutation({
                      mutation: trpc.treatment.deleteReception.mutate({ id: treatmentReception.id }),
                      collection: treatmentReceptionCollection,
                      onSuccess: { title: RECEPTION_DELETED_MESSAGE },
                    })
                  }
                />
              </div>
            ))}
          </div>
        ),
        header: RECEPTIONS_LABEL,
        id: "treatmentReceptions",
      }),
      ...(batch.isReceived
        ? []
        : [
            columnHelper.accessor("receiveQuantity", {
              header: RECEIVE_LABEL,
              id: "receiveQuantity",
              meta: {
                dataType: CellDataType.Number,
                editable: (row: TTreatmentBatchRow) => row.pendingQuantity > 0,
              },
            }),
          ]),
      columnHelper.display({
        cell: ({ row }) => (
          <ModelActions
            extraComponentsStart={
              <>
                <DialogBlueprintViewer
                  title={`Planos del Artículo ${row.original.part?.description ?? ""}`}
                  blueprints={row.original.part?.blueprints}
                />
                {row.original.pendingQuantity > 0 && (
                  <Button
                    testId="button-receive-all-pending"
                    variant="success"
                    size="icon"
                    clickable={!isReceiveQuantityFilled(row.original)}
                    onClick={() => {
                      if (!isReceiveQuantityFilled(row.original)) {
                        setReceiveQuantities((previous) =>
                          new Map(previous).set(row.original.id, row.original.pendingQuantity),
                        );
                      }
                    }}
                  >
                    {isReceiveQuantityFilled(row.original) ? <CheckIcon /> : <PlusIcon />}
                  </Button>
                )}
              </>
            }
            {...(row.original.treatmentReceptions.length === 0 && {
              deleteButton: {
                dialogTitle: DELETE_SHIPMENT_TITLE,
                dialogDescription: DELETE_SHIPMENT_MESSAGE,
                onConfirm: () =>
                  void showToastOnTRPCMutation({
                    mutation: trpc.treatment.deleteShipment.mutate({ id: row.original.id }),
                    collection: treatmentShipmentCollection,
                    onSuccess: { title: SHIPMENT_DELETED_MESSAGE },
                  }),
              },
            })}
          />
        ),
        header: ACTIONS_LABEL,
        id: "actions",
      }),
    ],
    [batch.isReceived, showToastOnTRPCMutation],
  );

  return (
    <BaseTable
      testId={`table-treatment-batch-${batch.sentAt.getTime()}`}
      title={`Enviado el ${formatDate(batch.sentAt, DateFormat.Datetime)}`}
      tableMode={TableMode.Editable}
      columns={columns}
      rows={rows}
      // A batch is a single shipment, so all of it is shown at once
      state={{ pagination: null }}
      onRowChange={(cell, value) =>
        setReceiveQuantities((previous) => new Map(previous).set(cell.row.original.id, value as number | null))
      }
      headerExtraComponents={
        !batch.isReceived && (
          <Button
            testId="button-receive-treatment"
            variant="success"
            disabled={items.length === 0 || isReceiving}
            onClick={async () => {
              setIsReceiving(true);
              const result = await showToastOnTRPCMutation({
                mutation: trpc.treatment.receive.mutate(items),
                collection: treatmentReceptionCollection,
                onSuccess: { title: PARTS_RECEIVED_FROM_TREATMENT_MESSAGE },
              });
              if (result !== null) {
                setReceiveQuantities(new Map());
              }
              setIsReceiving(false);
            }}
          >
            <PackageCheckIcon /> {RECEIVE_LABEL}
          </Button>
        )
      }
    />
  );
}
