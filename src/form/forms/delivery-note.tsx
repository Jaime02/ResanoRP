import { useSelector } from "@tanstack/react-store";

import TableDeliveryNoteLine from "@/components/table/delivery-note-line";
import { Card } from "@/components/ui/card";
import { useFormContext } from "@/form";
import type useDeliveryNoteForm from "@/form/hooks/use-delivery-note";
import { ADD_LINES_REQUIRES_DELIVERY_NOTE_MESSAGE, DELIVERY_NOTE_NUMBER_LABEL } from "@/messages/delivery-note";
import { FormMode, TableMode } from "@/types";

const formModeToTableModeMap: Record<FormMode, TableMode> = {
  [FormMode.Create]: TableMode.Disabled,
  [FormMode.Update]: TableMode.Editable,
  [FormMode.ReadOnly]: TableMode.ReadOnly,
  [FormMode.NotApplicable]: TableMode.Disabled,
};

interface FormDeliveryNoteProps extends Pick<ReturnType<typeof useDeliveryNoteForm>, "deliveryNote"> {
  createDeliveryNoteLine?: boolean;
  printTagDeliveryNoteLineId?: number;
}

export default function FormDeliveryNote({
  createDeliveryNoteLine,
  deliveryNote,
  printTagDeliveryNoteLineId,
}: FormDeliveryNoteProps) {
  const { form, formMode } = useFormContext();

  const clientId = useSelector(form.store, (state) => state.values.clientId);

  return (
    <>
      <div className="flex flex-row flex-wrap gap-2">
        <form.AppField
          name="id"
          children={(field) => (
            <field.NumberInput id="input-id-form-delivery-note" label={DELIVERY_NOTE_NUMBER_LABEL} readOnly />
          )}
        />
        <form.AppField
          name="deliveryDate"
          children={(field) => <field.DateInput id="input-delivery-date-form-delivery-note" />}
        />
        <form.AppField
          name="clientId"
          children={(field) => (
            <field.ClientCombobox
              id="combobox-client-form-delivery-note"
              nullable
              readOnly={formMode !== FormMode.Create}
            />
          )}
        />
        <form.AppField
          name="deliveryMethodId"
          children={(field) => (
            <field.DeliveryMethodCombobox id="combobox-delivery-method-form-delivery-note" nullable />
          )}
        />
      </div>
      <Card
        data-testid="card-table-delivery-note-line"
        className="col-span-2 justify-self-center"
        disabledMessage={formMode === FormMode.Create ? ADD_LINES_REQUIRES_DELIVERY_NOTE_MESSAGE : undefined}
      >
        <TableDeliveryNoteLine
          tableMode={formModeToTableModeMap[formMode]}
          deliveryNoteLines={deliveryNote?.deliveryNoteLines}
          deliveryNoteId={deliveryNote?.id}
          createDeliveryNoteLine={createDeliveryNoteLine}
          currentClientId={clientId}
          printTagDeliveryNoteLineId={printTagDeliveryNoteLineId}
        />
      </Card>
    </>
  );
}
