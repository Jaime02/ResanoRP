import { useSelector } from "@tanstack/react-store";
import { useEffect, useMemo } from "react";

import { useAppContext } from "@/contexts/app-context";
import { useAppForm } from "@/form";
import { endOfAppDay, startOfAppDay } from "@/lib/dates";
import { getDeliveryNoteLineUnitPrice, getLinesTotalInCents } from "@/lib/prices";
import { INVOICE_CREATED_MESSAGE } from "@/messages/invoice";
import { useQueryPendingDeliveryNotes } from "@/queries/invoice";
import { formCreateInvoiceSchema } from "@/schemas/invoice";
import type { TFormCreateInvoice } from "@/schemas/invoice";
import trpc from "@/trpc/trpc-client";
import { FormMode } from "@/types";
import type { BaseInvoiceSerialized } from "@/types/invoice";

const defaultCreateInvoiceFormData: { clientId: number | null; endDate: Date | null; startDate: Date | null } = {
  clientId: null,
  endDate: null,
  startDate: null,
};

interface UseCreateInvoiceFormProps {
  onSubmit?: (invoice: BaseInvoiceSerialized) => Promise<void>;
}

export default function useCreateInvoiceForm({ onSubmit }: UseCreateInvoiceFormProps) {
  const { showToastOnTRPCMutation } = useAppContext();

  const form = useAppForm({
    formId: "createInvoice",
    defaultValues: defaultCreateInvoiceFormData,
    onSubmit: async ({ value: createInvoiceFormData, formApi }) => {
      const result = await showToastOnTRPCMutation({
        mutation: trpc.invoice.create.mutate(createInvoiceFormData as TFormCreateInvoice),
        onSuccess: { title: INVOICE_CREATED_MESSAGE },
        onSubmit,
      });
      if (result !== null) {
        formApi.reset();
      }
    },
    validators: {
      onSubmit: formCreateInvoiceSchema,
    },
  });

  const clientId = useSelector(form.store, (state) => state.values.clientId);
  const startDate = useSelector(form.store, (state) => state.values.startDate);
  const endDate = useSelector(form.store, (state) => state.values.endDate);

  const { data: clientPendingDeliveryNotes, isLoading: isLoadingPendingDeliveryNotes } =
    useQueryPendingDeliveryNotes(clientId);

  const deliveryTimes = clientPendingDeliveryNotes.flatMap((deliveryNote) =>
    deliveryNote.deliveryDate === null ? [] : [new Date(deliveryNote.deliveryDate).getTime()],
  );
  const firstDeliveryTime = deliveryTimes.length > 0 ? Math.min(...deliveryTimes) : null;
  const lastDeliveryTime = deliveryTimes.length > 0 ? Math.max(...deliveryTimes) : null;

  // The dates that have not been picked by hand are filled in with the ones of the first and last pending Albarán
  // found, so every one of them is invoiced unless the range is narrowed. The filled in dates do not count as
  // changes made to the form, which is also what keeps a picked date from being overwritten when the Cliente changes.
  useEffect(() => {
    if (isLoadingPendingDeliveryNotes) return;
    if (form.getFieldMeta("startDate")?.isDirty !== true) {
      form.setFieldValue("startDate", firstDeliveryTime !== null ? startOfAppDay(new Date(firstDeliveryTime)) : null, {
        dontUpdateMeta: true,
      });
    }
    if (form.getFieldMeta("endDate")?.isDirty !== true) {
      form.setFieldValue("endDate", lastDeliveryTime !== null ? startOfAppDay(new Date(lastDeliveryTime)) : null, {
        dontUpdateMeta: true,
      });
    }
  }, [form, clientId, firstDeliveryTime, lastDeliveryTime, isLoadingPendingDeliveryNotes]);

  const pendingDeliveryNotes = useMemo(
    () =>
      clientPendingDeliveryNotes
        .filter((deliveryNote) => {
          if (deliveryNote.deliveryDate === null) return startDate === null && endDate === null;
          const deliveryDate = new Date(deliveryNote.deliveryDate);
          return (
            (startDate === null || deliveryDate >= startOfAppDay(startDate)) &&
            (endDate === null || deliveryDate <= endOfAppDay(endDate))
          );
        })
        .map((deliveryNote) => {
          const deliveryNoteLines = deliveryNote.deliveryNoteLines.map((deliveryNoteLine) => ({
            ...deliveryNoteLine,
            unitPrice: getDeliveryNoteLineUnitPrice(deliveryNoteLine),
          }));
          return { ...deliveryNote, deliveryNoteLines, totalInCents: getLinesTotalInCents(deliveryNoteLines) };
        }),
    [clientPendingDeliveryNotes, startDate, endDate],
  );

  const pendingDeliveryNotesTotalInCents = pendingDeliveryNotes.reduce(
    (accumulated, deliveryNote) => accumulated + deliveryNote.totalInCents,
    0,
  );

  const isLoading = useSelector(form.store, (state) => state.isSubmitting);

  return {
    form,
    formMode: FormMode.Create,
    isLoading,
    isLoadingPendingDeliveryNotes,
    pendingDeliveryNotes,
    pendingDeliveryNotesTotalInCents,
    validationSchema: formCreateInvoiceSchema,
  };
}

export type TPendingDeliveryNoteRow = ReturnType<typeof useCreateInvoiceForm>["pendingDeliveryNotes"][number];
export type TPendingDeliveryNoteLineRow = TPendingDeliveryNoteRow["deliveryNoteLines"][number];
