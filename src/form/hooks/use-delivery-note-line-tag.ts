import { useSelector } from "@tanstack/react-store";

import type { TPrintControls } from "@/components/print/use-print-controls";
import { useAppContext } from "@/contexts/app-context";
import { useAppForm } from "@/form";
import useResetForm from "@/form/hooks/use-reset-form";
import { getPartTagFileUrl, getPartTagName, PartTagSource } from "@/lib/part-tag";
import type { TPrintTagPart } from "@/schemas/delivery-note-line";
import { printTagPartSchema } from "@/schemas/delivery-note-line";
import type { TTagLabelSize } from "@/schemas/printer";
import trpc from "@/trpc/trpc-client";

const defaultPrintTagPartFormData = {
  tagGroups: [
    {
      partQuantity: 0,
      tagQuantity: 1,
    },
  ],
};

function getTagName(printPartTag: TPrintTagPart) {
  return printPartTag.deliveryNoteLineId !== undefined
    ? getPartTagName(PartTagSource.DeliveryNoteLine, printPartTag.deliveryNoteLineId)
    : getPartTagName(PartTagSource.SellOrderLine, printPartTag.sellOrderLineId);
}

interface UsePartTagFormProps {
  deliveryNoteLineId?: number;
  sellOrderLineId?: number;
  defaultPartQuantity?: number;
  printControls: TPrintControls;
  onSubmit?: () => Promise<void>;
}

export default function usePartTagForm({
  deliveryNoteLineId,
  sellOrderLineId,
  defaultPartQuantity,
  printControls,
  onSubmit,
}: UsePartTagFormProps) {
  const { showToastOnTRPCMutation } = useAppContext();

  const form = useAppForm({
    formId: "partTag",
    defaultValues: {
      ...(deliveryNoteLineId !== undefined ? { deliveryNoteLineId } : undefined),
      ...(sellOrderLineId !== undefined ? { sellOrderLineId } : undefined),
      labelSize: null as TTagLabelSize,
      tagGroups: [
        {
          ...defaultPrintTagPartFormData.tagGroups[0],
          partQuantity: defaultPartQuantity ?? defaultPrintTagPartFormData.tagGroups[0].partQuantity,
        },
      ],
    },
    // The tag is rendered at the size of the labels of the printer selected when it is printed
    onSubmit: async ({ value }) => {
      const printPartTag = { ...value, labelSize: printControls.labelSize } as TPrintTagPart;
      await showToastOnTRPCMutation({
        mutation: trpc.part.printTag.mutate(printPartTag),
        onSubmit: async () => {
          await printControls.printPdf(getPartTagFileUrl(getTagName(printPartTag)), onSubmit);
        },
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
