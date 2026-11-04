import { useSelector } from "@tanstack/react-store";

import productionOrderCollection from "@/collections/production-order";
import { useAppContext } from "@/contexts/app-context";
import { useAppForm } from "@/form";
import useResetForm from "@/form/hooks/use-reset-form";
import { hasDefaultQualityControl } from "@/lib/production-order";
import { PRODUCTION_ORDER_CREATED_MESSAGE, PRODUCTION_ORDER_EDITED_MESSAGE } from "@/messages/production-order";
import { useQueryProductionOrderForm } from "@/queries/production-order";
import { useQuerySellOrderLineToProduce } from "@/queries/sell-order-line";
import type { TCreateProductionOrder, TUpdateProductionOrder } from "@/schemas/production-order";
import { createProductionOrderSchema, updateProductionOrderSchema } from "@/schemas/production-order";
import trpc from "@/trpc/trpc-client";
import { FormMode } from "@/types";
import type { BaseProductionOrderSerialized } from "@/types/production-order";

const schemas = {
  [FormMode.Create]: createProductionOrderSchema,
  [FormMode.Update]: updateProductionOrderSchema,
  [FormMode.ReadOnly]: undefined,
  [FormMode.NotApplicable]: undefined,
};

export interface UseProductionOrderFormProps {
  requestedFormMode: FormMode;
  onSubmit?: (productionOrder: BaseProductionOrderSerialized) => Promise<void>;
  editProductionOrderId?: number;
  createSellOrderLineId?: number;
}

export default function useProductionOrderForm({
  requestedFormMode,
  editProductionOrderId,
  createSellOrderLineId,
  onSubmit,
}: UseProductionOrderFormProps) {
  const { showToastOnTRPCMutation } = useAppContext();

  const {
    data: productionOrder,
    isLoading: isLoadingProductionOrder,
    isLoadingError,
    isCrashed,
  } = useQueryProductionOrderForm({
    editProductionOrderId,
    skip: ![FormMode.Update, FormMode.ReadOnly].includes(requestedFormMode),
  });

  const { data: sellOrderLineToProduce, isLoading: isLoadingSellOrderLine } = useQuerySellOrderLineToProduce(
    requestedFormMode === FormMode.Create ? createSellOrderLineId : undefined,
  );

  const formMode =
    requestedFormMode === FormMode.Create
      ? FormMode.Create
      : productionOrder === undefined || productionOrder.deletedAt != null
        ? FormMode.ReadOnly
        : requestedFormMode;

  const validationSchema = schemas[formMode];

  // A Línea already served has nothing pending, so the quantity is left to choose
  const createQuantity =
    sellOrderLineToProduce !== undefined && sellOrderLineToProduce.pendingQuantity > 0
      ? sellOrderLineToProduce.pendingQuantity
      : null;
  const defaultValues = {
    ...(formMode !== FormMode.Create
      ? { id: productionOrder?.id, qualityControl: productionOrder?.qualityControl ?? false }
      : {}),
    notes: formMode === FormMode.Create ? null : (productionOrder?.notes ?? null),
    ...(formMode === FormMode.Create
      ? {
          partId: sellOrderLineToProduce?.partReference?.partId ?? null,
          qualityControl: hasDefaultQualityControl(createQuantity),
          quantity: createQuantity,
          sellOrderLineId: createSellOrderLineId ?? null,
        }
      : {}),
  };

  const form = useAppForm({
    formId: "productionOrder",
    defaultValues,
    onSubmit: async ({ value: productionOrderFormData }) => {
      if (formMode !== FormMode.Create && formMode !== FormMode.Update) return;
      const mutation =
        formMode === FormMode.Create
          ? trpc.productionOrder.create.mutate(productionOrderFormData as TCreateProductionOrder)
          : trpc.productionOrder.update.mutate(productionOrderFormData as TUpdateProductionOrder);
      await showToastOnTRPCMutation({
        mutation,
        onSuccess: {
          title: formMode === FormMode.Create ? PRODUCTION_ORDER_CREATED_MESSAGE : PRODUCTION_ORDER_EDITED_MESSAGE,
        },
        collection: productionOrderCollection,
        onSubmit,
      });
    },
    validators: {
      onSubmit: validationSchema,
    },
  });

  const isSubmitting = useSelector(form.store, (state) => state.isSubmitting);

  useResetForm(form, defaultValues, formMode);

  const isLoading = isLoadingProductionOrder || isLoadingSellOrderLine || isSubmitting;

  return {
    sellOrderLine: productionOrder?.sellOrderLine ?? sellOrderLineToProduce,
    validationSchema,
    form,
    formMode,
    getProductionOrderByIdError:
      isLoadingError ||
      isCrashed ||
      (editProductionOrderId !== undefined && !isLoadingProductionOrder && productionOrder === undefined),
    isLoading,
    productionOrder,
  };
}
