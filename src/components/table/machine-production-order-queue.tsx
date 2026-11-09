import { useNavigate } from "@tanstack/react-router";
import { ArrowUpToLineIcon, PlayIcon } from "lucide-react";
import { useCallback, useMemo } from "react";

import machineCollection from "@/collections/machine";
import machineProductionOrderQueueCollection from "@/collections/machine-production-order-queue";
import DialogBlueprintViewer from "@/components/dialog/blueprint-viewer";
import CogWorking from "@/components/icons/cog-working";
import ShapeIcon from "@/components/icons/shape";
import BaseTable from "@/components/table/base-table";
import { createTableColumnHelper } from "@/components/table/column-helper";
import { Button } from "@/components/ui/button";
import { ModelActions } from "@/components/ui/model-actions";
import { useAppContext } from "@/contexts/app-context";
import { formatDate, formatPartDimension } from "@/lib/formatters";
import log from "@/logging/log";
import { LoggerLevels } from "@/logging/types";
import { BLUEPRINTS_OF_PART_TITLE } from "@/messages/blueprint";
import {
  ACTIONS_LABEL,
  CLIENT_LABEL,
  DESCRIPTION_LABEL,
  QUANTITY_LABEL,
  REFERENCE_LABEL,
  SIZE_LABEL,
  STATUS_PENDING_LABEL,
} from "@/messages/common";
import {
  ASSIGN_PRODUCTION_ORDER_NO_ACTIVE_MACHINE_MESSAGE,
  ASSIGN_PRODUCTION_ORDER_REQUIRES_STOP_MESSAGE,
  NO_QUEUED_PRODUCTION_ORDERS_MESSAGE,
  PRODUCTION_ORDER_ASSIGNED_MESSAGE,
  PRODUCTION_ORDER_PRIORITIZED_MESSAGE,
} from "@/messages/production-order";
import { DELIVERY_LABEL } from "@/messages/sell-order";
import type { TMachineProductionOrderQueueItem } from "@/queries/machine";
import trpc from "@/trpc/trpc-client";
import { CellDataType } from "@/types";

interface TableMachineProductionOrderQueueProps {
  activeProductionOrderId?: number;
  productionOrdersQueue?: Array<TMachineProductionOrderQueueItem>;
  isLoading?: boolean;
}

const columnHelper = createTableColumnHelper<TMachineProductionOrderQueueItem>();

export default function TableMachineProductionOrderQueue({
  activeProductionOrderId,
  productionOrdersQueue,
  isLoading,
}: TableMachineProductionOrderQueueProps) {
  const { toaster, userModeMachine, showToastOnTRPCMutation } = useAppContext();
  const navigate = useNavigate();

  const onAssignProductionOrderButtonClick = useCallback(
    async (productionOrderId: number) => {
      if (activeProductionOrderId !== undefined) {
        toaster.info({ title: ASSIGN_PRODUCTION_ORDER_REQUIRES_STOP_MESSAGE });
        await navigate({
          search: (prev) => ({
            ...prev,
            dialogMachineProductionOrderQueueOpen: undefined,
            dialogStopProductionOrderOpen: true,
          }),
          to: ".",
        });
        return;
      }

      if (userModeMachine === undefined) {
        await log(LoggerLevels.error, ASSIGN_PRODUCTION_ORDER_NO_ACTIVE_MACHINE_MESSAGE);
        return;
      }

      await showToastOnTRPCMutation({
        mutation: trpc.machine.updateActiveProductionOrder.mutate({
          machineId: userModeMachine.id,
          productionOrderId,
        }),
        onSuccess: { title: PRODUCTION_ORDER_ASSIGNED_MESSAGE },
        collection: [machineCollection, machineProductionOrderQueueCollection],
        onSubmit: async () =>
          navigate({
            search: (prev) => ({ ...prev, dialogMachineProductionOrderQueueOpen: undefined }),
            to: ".",
          }),
      });
    },
    [activeProductionOrderId, navigate, toaster, userModeMachine, showToastOnTRPCMutation],
  );

  const columns = useMemo(
    () => [
      columnHelper.accessor((row) => row.sellOrderLine?.partReference?.reference, {
        header: REFERENCE_LABEL,
        id: "partReference",
      }),
      columnHelper.accessor((productionOrder) => productionOrder.part?.description, {
        header: DESCRIPTION_LABEL,
      }),
      columnHelper.accessor((row) => row.sellOrderLine?.sellOrder?.client?.name ?? "", {
        header: CLIENT_LABEL,
        id: "clientName",
        meta: { dataType: CellDataType.String, filterFieldName: "clientName" },
      }),
      columnHelper.accessor("quantity", {
        header: QUANTITY_LABEL,
      }),
      columnHelper.accessor(
        (row) =>
          row.quantity !== null ? Math.max(row.quantity - (row.producedQuantity?.producedQuantity ?? 0), 0) : undefined,
        {
          header: STATUS_PENDING_LABEL,
          id: "pendingQuantity",
        },
      ),
      columnHelper.accessor(
        (row) =>
          formatPartDimension({
            width: row.part?.width,
            length: row.part?.length,
          }),
        {
          cell: (info) => (
            <span className="inline-flex items-center gap-1">
              <ShapeIcon shapeName={info.row.original.part?.shape?.name} />
              {info.getValue()}
            </span>
          ),
          header: SIZE_LABEL,
          id: "dimension",
        },
      ),
      columnHelper.accessor((row) => row.sellOrderLine?.requestedDeliveryDate ?? "", {
        cell: (info) => formatDate(info.getValue()),
        header: DELIVERY_LABEL,
        meta: { dataType: CellDataType.Date, filterFieldName: "requestedDeliveryDate" },
      }),
      columnHelper.display({
        cell: ({ row }) => (
          <ModelActions
            disabled={isLoading}
            extraComponentsStart={
              <>
                <DialogBlueprintViewer
                  title={`${BLUEPRINTS_OF_PART_TITLE} "${row.original.sellOrderLine?.partReference?.reference ?? row.original.part?.description}"`}
                  blueprints={row.original.part?.blueprints}
                />
                <Button
                  testId="button-move-production-order-to-queue-start"
                  size="icon"
                  disabled={row.original.id === productionOrdersQueue?.at(0)?.id}
                  onClick={async () => {
                    if (!userModeMachine) {
                      return;
                    }
                    await showToastOnTRPCMutation({
                      mutation: trpc.machineProductionOrderQueue.moveProductionOrderToMachineQueueStart.mutate({
                        machineId: userModeMachine.id,
                        productionOrderId: row.original.id,
                      }),
                      onSuccess: { title: PRODUCTION_ORDER_PRIORITIZED_MESSAGE },
                      collection: machineProductionOrderQueueCollection,
                    });
                  }}
                >
                  <ArrowUpToLineIcon />
                </Button>
                <Button
                  testId="button-start-production-order"
                  size="icon"
                  variant={row.original.id === activeProductionOrderId ? "default" : "success"}
                  onClick={async () => onAssignProductionOrderButtonClick(row.original.id)}
                  disabled={row.original.id === activeProductionOrderId}
                  clickable={row.original.id !== activeProductionOrderId}
                >
                  {row.original.id === activeProductionOrderId ? <CogWorking /> : <PlayIcon />}
                </Button>
              </>
            }
          />
        ),
        header: ACTIONS_LABEL,
        id: "actions",
      }),
    ],
    [
      activeProductionOrderId,
      isLoading,
      onAssignProductionOrderButtonClick,
      productionOrdersQueue,
      userModeMachine,
      showToastOnTRPCMutation,
    ],
  );

  return (
    <BaseTable
      testId="table-machine-production-order-queue"
      rows={productionOrdersQueue}
      columns={columns}
      skeletonRowsCount={3}
      noDataMessage={NO_QUEUED_PRODUCTION_ORDERS_MESSAGE}
    />
  );
}
