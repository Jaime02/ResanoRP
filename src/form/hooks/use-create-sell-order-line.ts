import { useSelector } from "@tanstack/react-store";
import { useCallback, useState } from "react";

import sellOrderLineCollection from "@/collections/sell-order-line";
import { useAppContext } from "@/contexts/app-context";
import { useAppForm } from "@/form";
import useResetForm from "@/form/hooks/use-reset-form";
import { SELL_ORDER_LINE_CREATED_MESSAGE } from "@/messages/sell-order";
import { createCustomSellOrderLineSchema, createPartSellOrderLineSchema } from "@/schemas/sell-order-line";
import type { TCreateSellOrderLine } from "@/schemas/sell-order-line";
import trpc from "@/trpc/trpc-client";
import type { BaseSellOrderLineSerialized } from "@/types/sell-order-line";

const defaultSellOrderLineFormData = {
  description: null,
  notes: null,
  partId: null,
  partPrice: null,
  partPriceId: null,
  partReferenceId: null,
  quantity: null,
  requestedDeliveryDate: null,
};

interface UseSellOrderLineFormProps {
  sellOrderId?: number;
  onSubmit?: (sellOrderLine: BaseSellOrderLineSerialized) => Promise<void>;
}

export default function useCreateSellOrderLineForm({ sellOrderId, onSubmit }: UseSellOrderLineFormProps) {
  const { showToastOnTRPCMutation } = useAppContext();

  const [isCustomLine, setIsCustomLine] = useState(false);
  const validationSchema = isCustomLine ? createCustomSellOrderLineSchema : createPartSellOrderLineSchema;

  const form = useAppForm({
    formId: "createSellOrderLine",
    defaultValues: {
      description: defaultSellOrderLineFormData.description as string | null,
      notes: defaultSellOrderLineFormData.notes as string | null,
      partId: defaultSellOrderLineFormData.partId as number | null,
      partPrice: defaultSellOrderLineFormData.partPrice as string | null,
      partPriceId: defaultSellOrderLineFormData.partPriceId as number | null,
      partReferenceId: defaultSellOrderLineFormData.partReferenceId as number | null,
      quantity: defaultSellOrderLineFormData.quantity as number | null,
      requestedDeliveryDate: defaultSellOrderLineFormData.requestedDeliveryDate as Date | null,
      sellOrderId: sellOrderId ?? null,
    },
    onSubmit: async ({ value: sellOrderFormData, formApi }) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { partId, partPriceId, ...rest } = sellOrderFormData;
      await showToastOnTRPCMutation({
        mutation: trpc.sellOrderLine.create.mutate(rest as TCreateSellOrderLine),
        onSuccess: { title: SELL_ORDER_LINE_CREATED_MESSAGE },
        collection: sellOrderLineCollection,
        onSubmit: async (item) => {
          await onSubmit?.(item);
          formApi.reset();
        },
      });
    },
    validators: {
      // @ts-expect-error partId and partPriceId are part of the form but do not appear in the schema and are not submitted
      onSubmit: validationSchema,
    },
  });

  useResetForm(form, sellOrderId);

  const changeIsCustomLine = useCallback(
    (newIsCustomLine: boolean) => {
      setIsCustomLine(newIsCustomLine);
      // A hidden field keeps its errors, and they would block the submission. The price belonged to the other kind
      form.resetField(newIsCustomLine ? "partReferenceId" : "description");
      form.resetField("partId");
      form.resetField("partPrice");
      form.resetField("partPriceId");
    },
    [form],
  );

  const isSubmitting = useSelector(form.store, (state) => state.isSubmitting);

  const isLoading = isSubmitting || sellOrderId === undefined;

  return {
    form,
    isLoading,
    isCustomLine,
    changeIsCustomLine,
    validationSchema,
  };
}
