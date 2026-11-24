import { useSelector } from "@tanstack/react-store";

import type { TPrintControls } from "@/components/print/use-print-controls";
import { useAppContext } from "@/contexts/app-context";
import { useAppForm } from "@/form";
import useResetForm from "@/form/hooks/use-reset-form";
import { getPartTagFileUrl, getPartTagName, PartTagSource } from "@/lib/part-tag";
import type { TPrintTagPart, TPrintTagPartSellOrderLines } from "@/schemas/delivery-note-line";
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

function getTagName(printPartTag: TPrintTagPart, printId: string) {
  return printPartTag.deliveryNoteLineId !== undefined
    ? getPartTagName(PartTagSource.DeliveryNoteLine, printPartTag.deliveryNoteLineId, printId)
    : getPartTagName(PartTagSource.SellOrderLine, printPartTag.sellOrderLines[0].id, printId);
}

interface UsePartTagFormProps {
  deliveryNoteLineId?: number;
  sellOrderLines?: TPrintTagPartSellOrderLines;
  defaultPartQuantity?: number;
  printControls: TPrintControls;
  onSubmit?: () => Promise<void>;
}

export default function usePartTagForm({
  deliveryNoteLineId,
  sellOrderLines,
  defaultPartQuantity,
  printControls,
  onSubmit,
}: UsePartTagFormProps) {
  const { showToastOnTRPCMutation } = useAppContext();

  const form = useAppForm({
    formId: "partTag",
    defaultValues: {
      ...(deliveryNoteLineId !== undefined ? { deliveryNoteLineId } : undefined),
      ...(sellOrderLines !== undefined ? { sellOrderLines } : undefined),
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
      const printId = crypto.randomUUID();
      await showToastOnTRPCMutation({
        mutation: trpc.part.printTag.mutate({ ...printPartTag, printId }),
        onSubmit: async () => {
          await printControls.printPdf(getPartTagFileUrl(getTagName(printPartTag, printId)), onSubmit);
        },
      });
    },
    validators: {
      onChange: printTagPartSchema,
    },
  });

  const isSubmitting = useSelector(form.store, (state) => state.isSubmitting);

  useResetForm(form, deliveryNoteLineId, sellOrderLines, defaultPartQuantity);

  return {
    form,
    isLoading: isSubmitting,
    validationSchema: printTagPartSchema,
  };
}
