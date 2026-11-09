import { useMemo, useState } from "react";

import type { ComboboxProps } from "@/components/ui/combobox";
import { Combobox } from "@/components/ui/combobox";
import { useAppContext } from "@/contexts/app-context";
import { formatDate } from "@/lib/formatters";
import log from "@/logging/log";
import { LogMessages, LoggerLevels } from "@/logging/types";
import { NO_DELIVERY_NOTES_MESSAGE, SELECT_DELIVERY_NOTE_PLACEHOLDER } from "@/messages/combobox";
import { INVOICED_DELIVERY_NOTE_SUFFIX_LABEL } from "@/messages/delivery-note";
import { useQueryClientDeliveryNotesWithInvoiceStatus } from "@/queries/delivery-note";

type TDeliveryNoteOption = NonNullable<ReturnType<typeof useQueryClientDeliveryNotesWithInvoiceStatus>["data"]>[number];

type ComboboxDeliveryNoteProps = Omit<
  ComboboxProps<TDeliveryNoteOption>,
  "items" | "formatItem" | "filter" | "onFilterChange" | "activeItem"
> & {
  clientId: number | null;
  activeItemId?: number;
};

function formatDeliveryNote(deliveryNote: TDeliveryNoteOption | null) {
  if (deliveryNote === null) {
    return "";
  }
  const status =
    deliveryNote.invoiceAccounted === true
      ? INVOICED_DELIVERY_NOTE_SUFFIX_LABEL
      : deliveryNote.invoiceId !== null
        ? ` (Factura ${deliveryNote.invoiceId})`
        : "";
  return `Albarán ${deliveryNote.id} - ${formatDate(deliveryNote.deliveryDate)}${status}`;
}

export default function ComboboxDeliveryNote({
  clientId,
  activeItemId,
  placeholder = SELECT_DELIVERY_NOTE_PLACEHOLDER,
  noItemsMessage = NO_DELIVERY_NOTES_MESSAGE,
  loading,
  ...props
}: ComboboxDeliveryNoteProps) {
  const { isAdmin } = useAppContext();
  const [filter, setFilter] = useState<string | undefined>(undefined);

  const { data, isLoading, isLoadingError, isCrashed } = useQueryClientDeliveryNotesWithInvoiceStatus(clientId);

  const deliveryNotes = useMemo(
    () =>
      (data ?? []).filter(
        (deliveryNote) =>
          (isAdmin || deliveryNote.invoiceAccounted !== true) &&
          (filter === undefined || formatDeliveryNote(deliveryNote).toLowerCase().includes(filter.toLowerCase())),
      ),
    [data, isAdmin, filter],
  );

  if (isLoadingError || isCrashed) {
    void log(LoggerLevels.error, LogMessages.comboboxFetchFailed("delivery notes", "ComboboxDeliveryNote"));
  }

  return (
    <Combobox
      items={deliveryNotes}
      loading={isLoading || loading}
      filter={filter}
      onFilterChange={setFilter}
      formatItem={formatDeliveryNote}
      placeholder={placeholder}
      noItemsMessage={noItemsMessage}
      activeItem={data?.find((deliveryNote) => deliveryNote.id === activeItemId) ?? null}
      {...props}
    />
  );
}
