import { useSelector } from "@tanstack/react-store";

import { useAppContext } from "@/contexts/app-context";
import { useAppForm } from "@/form";
import useResetForm from "@/form/hooks/use-reset-form";
import { LABEL_PRINTED_MESSAGE } from "@/messages/production-order";
import type { TPrintTagPart } from "@/schemas/delivery-note-line";
import { printTagPartSchema } from "@/schemas/delivery-note-line";
import trpc from "@/trpc/trpc-client";

const defaultPrintTagPartFormData = {
  tagGroups: [
    {
      partQuantity: 0,
      tagQuantity: 1,
    },
  ],
};

interface UsePartTagFormProps {
  deliveryNoteLineId?: number;
  sellOrderLineId?: number;
  defaultPartQuantity?: number;
  onSubmit?: () => Promise<void>;
}

export default function usePartTagForm({
  deliveryNoteLineId,
  sellOrderLineId,
  defaultPartQuantity,
  onSubmit,
}: UsePartTagFormProps) {
  const { showToastOnTRPCMutation } = useAppContext();

  const form = useAppForm({
    formId: "partTag",
    defaultValues: {
      ...(deliveryNoteLineId !== undefined ? { deliveryNoteLineId } : undefined),
      ...(sellOrderLineId !== undefined ? { sellOrderLineId } : undefined),
      tagGroups: [
        {
          ...defaultPrintTagPartFormData.tagGroups[0],
          partQuantity: defaultPartQuantity ?? defaultPrintTagPartFormData.tagGroups[0].partQuantity,
        },
      ],
    },
    onSubmit: async ({ value: printPartTag }) => {
      await showToastOnTRPCMutation({
        mutation: trpc.part.printTag.mutate(printPartTag as TPrintTagPart),
        onSuccess: { title: LABEL_PRINTED_MESSAGE },
        onSubmit,
      });
    },
    validators: {
      onSubmit: printTagPartSchema,
    },
  });

  const isSubmitting = useSelector(form.store, (state) => state.isSubmitting);

  useResetForm(form, deliveryNoteLineId, sellOrderLineId, defaultPartQuantity);

  return {
    form,
    isLoading: isSubmitting,
    validationSchema: printTagPartSchema,
  };
}
