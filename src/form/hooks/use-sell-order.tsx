import { useSelector } from "@tanstack/react-store";
import { useEffect, useMemo } from "react";

import sellOrderCollection from "@/collections/sell-order";
import ButtonLink from "@/components/ui/button-link";
import { useAppContext } from "@/contexts/app-context";
import { useAppForm } from "@/form";
import useResetForm from "@/form/hooks/use-reset-form";
import { computeSellOrderLineStatus } from "@/lib/sell-order-line";
import { useNow } from "@/lib/use-now";
import { objectToFormData } from "@/lib/utils";
import {
  SELL_ORDER_CREATED_MESSAGE,
  SELL_ORDER_EDITED_MESSAGE,
  SELL_ORDER_REFERENCE_EXISTS_MESSAGE,
  SELL_ORDER_REFERENCE_IN_USE_MESSAGE,
  SELL_ORDER_TITLE_LABEL,
} from "@/messages/sell-order";
import { useQueryClientDefaultPaymentMethod } from "@/queries/client";
import { useQueryProductionOrderStatusesBySellOrderLineIds } from "@/queries/production-order";
import { useQuerySellOrderByClientReference, useQuerySellOrder } from "@/queries/sell-order";
import { createSellOrderFormDataSchema, updateSellOrderFormDataSchema } from "@/schemas/sell-order";
import type { TCreateSellOrder, TUpdateSellOrder } from "@/schemas/sell-order";
import { SellOrderStatus } from "@/schemas/sell-order";
import type { SellOrderLineStatus } from "@/schemas/sell-order-line";
import trpc from "@/trpc/trpc-client";
import { FormMode } from "@/types";
import type { BaseSellOrder, BaseSellOrderSerialized } from "@/types/sell-order";
import type { BaseSellOrderLine } from "@/types/sell-order-line";

const schemas = {
  [FormMode.Create]: createSellOrderFormDataSchema,
  [FormMode.Update]: updateSellOrderFormDataSchema,
  [FormMode.ReadOnly]: undefined,
  [FormMode.NotApplicable]: undefined,
};

interface BaseProps {
  controlledSellOrder?: TSellOrderForm;
  editSellOrderId?: number;
  skipQueries?: boolean;
}

interface CreateProps extends BaseProps {
  requestedFormMode: FormMode.Create;
  onSubmit?: (sellOrder: BaseSellOrderSerialized) => Promise<void>;
}

interface UpdateProps extends BaseProps {
  requestedFormMode: FormMode.Update;
  onSubmit?: (sellOrder: BaseSellOrderSerialized) => Promise<void>;
}

interface ReadOnlyProps extends BaseProps {
  requestedFormMode: FormMode.ReadOnly;
  onSubmit?: never;
}

export type UseSellOrderFormProps = CreateProps | UpdateProps | ReadOnlyProps;

export default function useSellOrderForm({
  requestedFormMode,
  controlledSellOrder,
  editSellOrderId,
  skipQueries,
  onSubmit,
}: UseSellOrderFormProps) {
  const { toaster, showToastOnTRPCMutation } = useAppContext();

  const {
    data: sellOrderData,
    isLoading: isLoadingSellOrder,
    isLoadingError,
    isCrashed,
  } = useQuerySellOrder({ editSellOrderId, skip: skipQueries === true || controlledSellOrder !== undefined });

  const sellOrder = controlledSellOrder ?? sellOrderData;

  const formMode =
    requestedFormMode === FormMode.Create
      ? requestedFormMode
      : sellOrder === undefined || sellOrder.deletedAt != null || sellOrder.client?.deletedAt != null
        ? FormMode.ReadOnly
        : requestedFormMode;

  const validationSchema = schemas[formMode];

  const defaultSellOrderFormData = {
    clientId: null,
    clientReference: null,
    id: null,
    notes: null,
    paymentMethodId: null,
    sellOrderFile: null,
  };
  const now = useNow();

  const defaultValues = {
    ...(formMode !== FormMode.Create ? { id: sellOrder?.id } : {}),
    clientId: formMode === FormMode.Create ? defaultSellOrderFormData.clientId : (sellOrder?.clientId ?? null),
    clientReference:
      formMode === FormMode.Create ? defaultSellOrderFormData.clientReference : (sellOrder?.clientReference ?? null),
    notes: formMode === FormMode.Create ? defaultSellOrderFormData.notes : (sellOrder?.notes ?? null),
    paymentMethodId:
      formMode === FormMode.Create ? defaultSellOrderFormData.paymentMethodId : (sellOrder?.paymentMethodId ?? null),
    receptionDate: formMode === FormMode.Create ? now : (sellOrder?.receptionDate ?? null),
    sellOrderFile: null as File | null,
  };

  const form = useAppForm({
    formId: "sellOrder",
    defaultValues,
    onSubmit: async ({ value: sellOrderFormData }) => {
      if (formMode !== FormMode.Create && formMode !== FormMode.Update) return;

      const mutation =
        formMode === FormMode.Create
          ? trpc.sellOrder.create.mutate(objectToFormData(sellOrderFormData as TCreateSellOrder))
          : trpc.sellOrder.update.mutate(objectToFormData(sellOrderFormData as TUpdateSellOrder));
      await showToastOnTRPCMutation({
        mutation,
        onSuccess: { title: formMode === FormMode.Create ? SELL_ORDER_CREATED_MESSAGE : SELL_ORDER_EDITED_MESSAGE },
        collection: sellOrderCollection,
        onSubmit,
      });
    },
    validators: {
      // @ts-expect-error The schemas parse the FormData sent to the server, whose types differ from the form values
      onSubmit: validationSchema,
    },
  });

  useResetForm(form, defaultValues, formMode);

  const clientId = useSelector(form.store, (state) => state.values.clientId);
  const clientReference = useSelector(form.store, (state) => state.values.clientReference);
  const isPristine = useSelector(form.store, (state) => state.isPristine);
  const isSubmitting = useSelector(form.store, (state) => state.isSubmitting);

  const skipQueriesValidateUniqueSellOrderClientReference =
    skipQueries === true ||
    isLoadingSellOrder ||
    clientReference === null ||
    clientId === null ||
    formMode === FormMode.ReadOnly ||
    isPristine ||
    isSubmitting;

  const { data: sellOrderByClientReference } = useQuerySellOrderByClientReference({
    clientId,
    clientReference,
    skip: skipQueriesValidateUniqueSellOrderClientReference,
  });

  useEffect(() => {
    if (skipQueriesValidateUniqueSellOrderClientReference) {
      return;
    }

    if (
      sellOrderByClientReference &&
      ((formMode === FormMode.Update && sellOrderByClientReference.id !== sellOrder?.id) ||
        formMode === FormMode.Create)
    ) {
      toaster.error({
        title: SELL_ORDER_REFERENCE_EXISTS_MESSAGE,
      });
      form.setFieldMeta("clientReference", (prev) => ({
        ...prev,
        errorMap: {
          onChange: {
            message: (
              <>
                {SELL_ORDER_REFERENCE_IN_USE_MESSAGE}
                <ButtonLink to="/sell-order/$id" params={{ id: sellOrderByClientReference.id }} target="_blank">
                  {SELL_ORDER_TITLE_LABEL}
                </ButtonLink>
              </>
            ),
          },
        },
      }));
    } else {
      form.setFieldMeta("clientReference", (prev) => ({
        ...prev,
        errorMap: {
          onChange: undefined,
        },
      }));
    }
  }, [
    skipQueriesValidateUniqueSellOrderClientReference,
    sellOrderByClientReference,
    formMode,
    sellOrder?.id,
    toaster,
    form,
  ]);

  const { data: defaultPaymentMethodOfClient, isLoading: isLoadingDefaultPaymentMethod } =
    useQueryClientDefaultPaymentMethod(clientId === null || formMode === FormMode.ReadOnly ? null : clientId);

  const suggestedPaymentMethodId = useMemo(() => {
    if (clientId === null || defaultPaymentMethodOfClient === undefined) {
      return null;
    }
    if (formMode === FormMode.Update && sellOrder?.paymentMethodId != null) {
      return defaultPaymentMethodOfClient.id;
    }
    if (formMode === FormMode.Create) {
      return defaultPaymentMethodOfClient.id;
    }
    return null;
  }, [clientId, defaultPaymentMethodOfClient, formMode, sellOrder?.paymentMethodId]);

  useEffect(() => {
    if (formMode === FormMode.Create && suggestedPaymentMethodId !== null) {
      form.setFieldValue("paymentMethodId", suggestedPaymentMethodId);
    }
  }, [formMode, suggestedPaymentMethodId, form]);

  const isLoading = isLoadingDefaultPaymentMethod || isLoadingSellOrder || isSubmitting;

  return {
    validationSchema,
    form,
    formMode,
    isLoading,
    sellOrder,
    getSellOrderByIdQueryError:
      isLoadingError || isCrashed || (editSellOrderId !== undefined && !isLoadingSellOrder && sellOrder === undefined),
  };
}

export type TSellOrderForm = NonNullable<ReturnType<typeof useQuerySellOrder>["data"]>;
export type TSellOrderLineForm = TSellOrderForm["sellOrderLines"][number];

export function getSellOrderStatus(sellOrder?: TSellOrderForm): SellOrderStatus | undefined {
  if (sellOrder === undefined) return undefined;

  if (sellOrder.deletedAt) {
    return SellOrderStatus.Deleted;
  }

  if (sellOrder.client?.deletedAt) {
    return SellOrderStatus.ClientDeleted;
  }

  const pendingLines = sellOrder.sellOrderLines.filter((line) => line.pendingQuantity !== 0 && line.deletedAt === null);
  if (pendingLines.length === 0) {
    return SellOrderStatus.Completed;
  }

  return SellOrderStatus.Pending;
}

export interface TUseSellOrderStatusProps {
  sellOrderLine: BaseSellOrderLine;
  sellOrder: BaseSellOrder;
}

export function useSellOrderLineStatus({ sellOrderLine, sellOrder }: TUseSellOrderStatusProps): SellOrderLineStatus {
  const sellOrderLineIds = useMemo(() => [sellOrderLine.id], [sellOrderLine.id]);
  const { data: productionOrders } = useQueryProductionOrderStatusesBySellOrderLineIds(sellOrderLineIds);

  return computeSellOrderLineStatus({
    productionOrderStatuses: productionOrders.map((productionOrder) => productionOrder.status),
    sellOrder,
    sellOrderLine,
  });
}
