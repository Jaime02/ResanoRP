import { useSelector } from "@tanstack/react-store";

import { useAppContext } from "@/contexts/app-context";
import { useAppForm } from "@/form";
import useResetForm from "@/form/hooks/use-reset-form";
import {
  MACHINE_PRODUCTION_ORDER_VALIDATION_ERROR_MESSAGE,
  PRODUCTION_ORDER_EDITED_MESSAGE,
  PRODUCTION_ORDER_STOPPED_MESSAGE,
} from "@/messages/production-order";
import type { TActiveProductionOrder } from "@/queries/production-order";
import type { TStopMachineProductionOrder } from "@/schemas/machine-production-order";
import {
  stopMachineProductionOrderSchema,
  updateMachineProductionOrderSchema,
} from "@/schemas/machine-production-order";
import trpc from "@/trpc/trpc-client";
import type { BaseProductionOrderSerialized } from "@/types/production-order";

interface UseMachineProductionOrderFormProps {
  productionOrder?: TActiveProductionOrder;
  onMachineProductionOrderUpdateSubmit?: (productionOrder?: BaseProductionOrderSerialized) => Promise<void>;
  onMachineProductionOrderStopSubmit?: () => Promise<void>;
}

export default function useMachineProductionOrderForm({
  productionOrder,
  onMachineProductionOrderUpdateSubmit,
  onMachineProductionOrderStopSubmit,
}: UseMachineProductionOrderFormProps) {
  const { toaster, showToastOnTRPCMutation, userModeMachine } = useAppContext();

  const formUpdateMachineProductionOrder = useAppForm({
    formId: "updateMachineProductionOrder",
    defaultValues: {
      notes: productionOrder?.notes,
      productionOrderId: productionOrder?.id,
    },
    onSubmit: async ({ value: machineProductionOrderFormData, formApi }) => {
      if (formApi.state.isDefaultValue) return;

      const mutationValidationResult = updateMachineProductionOrderSchema.safeParse(machineProductionOrderFormData);
      if (!mutationValidationResult.success) {
        toaster.error({ title: MACHINE_PRODUCTION_ORDER_VALIDATION_ERROR_MESSAGE });
        return;
      }
      await showToastOnTRPCMutation({
        mutation: trpc.machine.updateMachineProductionOrder.mutate(mutationValidationResult.data),
        onSuccess: { title: PRODUCTION_ORDER_EDITED_MESSAGE },
        onSubmit: onMachineProductionOrderUpdateSubmit,
      });
    },
    validators: {
      onSubmit: updateMachineProductionOrderSchema,
    },
  });

  const formStopCurrentProductionOrder = useAppForm({
    formId: "stopCurrentProductionOrder",
    defaultValues: {
      machineId: userModeMachine?.id,
      producedQuantity: null as number | null,
    },
    onSubmit: async ({ value: stopMachineProductionOrderFormData }) => {
      await showToastOnTRPCMutation({
        mutation: trpc.machine.stopProductionOrder.mutate(
          stopMachineProductionOrderFormData as TStopMachineProductionOrder,
        ),
        onSuccess: { title: PRODUCTION_ORDER_STOPPED_MESSAGE },
        onSubmit: onMachineProductionOrderStopSubmit,
      });
    },
    validators: {
      onChange: stopMachineProductionOrderSchema,
    },
  });

  useResetForm(formUpdateMachineProductionOrder, productionOrder, userModeMachine);
  useResetForm(formStopCurrentProductionOrder, productionOrder, userModeMachine);

  const isSubmittingUpdateMachineProductionOrder = useSelector(
    formUpdateMachineProductionOrder.store,
    (state) => state.isSubmitting,
  );
  const isSubmittingStopMachineProductionOrder = useSelector(
    formStopCurrentProductionOrder.store,
    (state) => state.isSubmitting,
  );
  const isSubmitting = isSubmittingUpdateMachineProductionOrder || isSubmittingStopMachineProductionOrder;

  const isLoading = isSubmitting;

  return {
    formUpdateMachineProductionOrder,
    formUpdateMachineProductionOrderValidationSchema: updateMachineProductionOrderSchema,
    formStopCurrentProductionOrder,
    formStopCurrentProductionOrderValidationSchema: stopMachineProductionOrderSchema,
    isLoading,
  };
}
