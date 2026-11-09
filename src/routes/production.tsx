import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { z } from "zod";

import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { UserMode, useAppContext } from "@/contexts/app-context";
import FormMachineProductionOrder from "@/form/forms/machine-production-order";
import useMachineProductionOrderForm from "@/form/hooks/use-machine-production-order";
import log from "@/logging/log";
import { LogMessages, LoggerLevels } from "@/logging/types";
import { ACTIVE_PRODUCTION_ORDER_NOT_FOUND_MESSAGE, PRODUCTION_PANEL_TITLE } from "@/messages/production-order";
import { useQueryMachineProductionOrderQueue } from "@/queries/machine";
import { useQueryActiveProductionOrder } from "@/queries/production-order";

const routeSearchSchema = z.object({
  dialogMachineProductionOrderQueueOpen: z.boolean().optional().catch(undefined),
  dialogStopProductionOrderOpen: z.boolean().optional().catch(undefined),
});

export const Route = createFileRoute("/production")({
  beforeLoad: () => ({
    title: PRODUCTION_PANEL_TITLE,
  }),
  component: RouteComponent,
  staticData: { userModes: [UserMode.Machine] },
  validateSearch: routeSearchSchema,
});

function RouteComponent() {
  const { dialogStopProductionOrderOpen, dialogMachineProductionOrderQueueOpen } = Route.useSearch();
  const { isDocumentHydrated, userModeMachine, isLoadingUserModeMachine } = useAppContext();
  const navigate = useNavigate();

  const {
    data: activeProductionOrder,
    isLoading: isLoadingActiveProductionOrder,
    isReady: isActiveProductionOrderReady,
  } = useQueryActiveProductionOrder({
    productionOrderId: userModeMachine?.activeProductionOrderId,
  });

  const { data: machineProductionOrdersQueue, isLoading: isLoadingMachineProductionOrdersQueue } =
    useQueryMachineProductionOrderQueue({
      machineId: userModeMachine?.id,
    });

  const onMachineProductionOrderStopSubmit = useCallback(async () => {
    await navigate({
      search: (prev) => ({ ...prev, dialogStopProductionOrderOpen: undefined }),
      to: ".",
    });
  }, [navigate]);

  const {
    formUpdateMachineProductionOrder,
    formStopCurrentProductionOrder,
    isLoading: isLoadingMachineProductionOrderForm,
    formUpdateMachineProductionOrderValidationSchema,
    formStopCurrentProductionOrderValidationSchema,
  } = useMachineProductionOrderForm({
    onMachineProductionOrderStopSubmit,
    productionOrder: activeProductionOrder,
  });

  const isLoading =
    !isDocumentHydrated ||
    isLoadingUserModeMachine ||
    isLoadingActiveProductionOrder ||
    isLoadingMachineProductionOrdersQueue ||
    isLoadingMachineProductionOrderForm;

  // Only the queue opened for lacking an active order is closed, not one opened by hand while an order is active
  const hadActiveProductionOrder = useRef(true);
  useLayoutEffect(() => {
    const hasActiveProductionOrder = activeProductionOrder !== undefined;
    if (
      hasActiveProductionOrder &&
      !hadActiveProductionOrder.current &&
      dialogMachineProductionOrderQueueOpen === true
    ) {
      void navigate({
        search: (prev) => ({ ...prev, dialogMachineProductionOrderQueueOpen: undefined }),
        to: ".",
      });
    }
    if (!isLoading) {
      hadActiveProductionOrder.current = hasActiveProductionOrder;
    }
  }, [activeProductionOrder, dialogMachineProductionOrderQueueOpen, isLoading, navigate]);

  useLayoutEffect(() => {
    if (activeProductionOrder === undefined && dialogStopProductionOrderOpen === true) {
      void navigate({
        search: (prev) => ({ ...prev, dialogStopProductionOrderOpen: undefined }),
        to: ".",
      });
    }
    if (activeProductionOrder === undefined && userModeMachine && !isLoading) {
      void navigate({
        search: (prev) => ({ ...prev, dialogMachineProductionOrderQueueOpen: true }),
        to: ".",
      });
    }
  }, [activeProductionOrder, dialogStopProductionOrderOpen, isLoading, navigate, userModeMachine]);

  // Solo es un error si la Máquina tiene una Orden activa asignada que no se encuentra:
  // sin activeProductionOrderId el effect anterior abre la cola para asignar una.
  const isActiveProductionOrderMissing =
    userModeMachine?.activeProductionOrderId != null &&
    activeProductionOrder === undefined &&
    !isLoading &&
    isActiveProductionOrderReady;

  useEffect(() => {
    if (isActiveProductionOrderMissing) {
      void log(LoggerLevels.error, LogMessages.activeProductionOrderNotInQueue(userModeMachine.id));
    }
  }, [isActiveProductionOrderMissing, userModeMachine]);

  if (isActiveProductionOrderMissing) {
    return <div>{ACTIVE_PRODUCTION_ORDER_NOT_FOUND_MESSAGE}</div>;
  }

  return (
    <div
      data-testid="container-production"
      data-loading={isLoading}
      className="relative flex size-full grow flex-col items-center gap-2"
    >
      <FormMachineProductionOrder
        activeProductionOrder={activeProductionOrder}
        formUpdateMachineProductionOrder={formUpdateMachineProductionOrder}
        formUpdateMachineProductionOrderValidationSchema={formUpdateMachineProductionOrderValidationSchema}
        formStopCurrentProductionOrder={formStopCurrentProductionOrder}
        formStopCurrentProductionOrderValidationSchema={formStopCurrentProductionOrderValidationSchema}
        productionOrdersQueue={machineProductionOrdersQueue}
        dialogStopProductionOrderOpen={dialogStopProductionOrderOpen}
        dialogMachineProductionOrderQueueOpen={dialogMachineProductionOrderQueueOpen}
        isLoading={isLoading}
      />
      {isLoading && <LoadingOverlay testId="loading-overlay-form-production" />}
    </div>
  );
}
