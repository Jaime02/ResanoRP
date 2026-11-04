import { useSelector } from "@tanstack/react-store";
import { useCallback, useState } from "react";

import deliveryNoteLineCollection from "@/collections/delivery-note-line";
import invoiceCollection from "@/collections/invoice";
import { useAppContext } from "@/contexts/app-context";
import { useAppForm } from "@/form";
import useResetForm from "@/form/hooks/use-reset-form";
import { DELIVERY_NOTE_LINE_CREATED_MESSAGE } from "@/messages/delivery-note";
import { createCustomDeliveryNoteLineSchema, createPartDeliveryNoteLineSchema } from "@/schemas/delivery-note-line";
import type { TCreateDeliveryNoteLine } from "@/schemas/delivery-note-line";
import trpc from "@/trpc/trpc-client";
import { FormMode } from "@/types";
import type { BaseDeliveryNoteLine } from "@/types/delivery-note-line";

const defaultDeliveryNoteLineFormData = {
  description: null,
  partId: null,
  partReferenceId: null,
  quantity: null,
  partPriceId: null,
  unitPrice: null,
};

interface UseDeliveryNoteLineFormProps {
  deliveryNoteId: number;
  onSubmit?: (deliveryNoteLine: BaseDeliveryNoteLine) => Promise<void>;
}

export default function useCreateDeliveryNoteLineForm({ deliveryNoteId, onSubmit }: UseDeliveryNoteLineFormProps) {
  const { showToastOnTRPCMutation } = useAppContext();

  const [isCustomLine, setIsCustomLine] = useState(false);
  const validationSchema = isCustomLine ? createCustomDeliveryNoteLineSchema : createPartDeliveryNoteLineSchema;

  const form = useAppForm({
    formId: "createDeliveryNoteLine",
    defaultValues: {
      deliveryNoteId,
      description: defaultDeliveryNoteLineFormData.description as string | null,
      partId: defaultDeliveryNoteLineFormData.partId as number | null,
      partReferenceId: defaultDeliveryNoteLineFormData.partReferenceId as number | null,
      quantity: defaultDeliveryNoteLineFormData.quantity as number | null,
      partPriceId: defaultDeliveryNoteLineFormData.partPriceId as number | null,
      unitPrice: defaultDeliveryNoteLineFormData.unitPrice as string | null,
    },
    onSubmit: async ({ value: deliveryNoteFormData }) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { partId, partPriceId, ...rest } = deliveryNoteFormData;
      await showToastOnTRPCMutation({
        mutation: trpc.deliveryNoteLine.create.mutate(rest as TCreateDeliveryNoteLine),
        onSuccess: { title: DELIVERY_NOTE_LINE_CREATED_MESSAGE },
        collection: (result) => [
          deliveryNoteLineCollection,
          ...(result.resetInvoiceIds.length > 0 ? [invoiceCollection] : []),
        ],
        onSubmit,
      });
    },
    validators: {
      // @ts-expect-error partId and partPriceId are part of the form but not in the schema
      onSubmit: validationSchema,
    },
  });

  useResetForm(form, deliveryNoteId);

  const changeIsCustomLine = useCallback(
    (newIsCustomLine: boolean) => {
      setIsCustomLine(newIsCustomLine);
      // A hidden field keeps its errors, and they would block the submission. The price belonged to the other kind
      form.resetField("partReferenceId");
      form.resetField("partId");
      form.resetField("description");
      form.resetField("unitPrice");
      form.resetField("partPriceId");
    },
    [form],
  );

  const isLoading = useSelector(form.store, (state) => state.isSubmitting);

  return {
    form,
    formMode: FormMode.Create,
    validationSchema,
    isLoading,
    isCustomLine,
    changeIsCustomLine,
  };
}
