import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useAppContext } from "@/contexts/app-context";
import { useFormContext } from "@/form";
import FormPartPriceFields from "@/form/forms/part-price-fields";
import { DESCRIPTION_LABEL, QUANTITY_LABEL } from "@/messages/common";
import { CLIENT_REFERENCE_DESCRIPTION_LABEL } from "@/messages/part";
import { LINE_WITHOUT_REFERENCE_LABEL } from "@/messages/sell-order";
import { TablePartPickerMode } from "@/types";

interface FormDeliveryNoteLineProps {
  currentClientId?: number | null;
  isCustomLine: boolean;
  changeIsCustomLine: (isCustomLine: boolean) => void;
}

export default function FormDeliveryNoteLine({
  currentClientId,
  isCustomLine,
  changeIsCustomLine,
}: FormDeliveryNoteLineProps) {
  const { form, isLoading } = useFormContext();
  const { isAdmin } = useAppContext();
  return (
    <>
      <Label className="flex flex-row items-center gap-2">
        <Checkbox
          testId="checkbox-custom-line"
          checked={isCustomLine}
          onCheckedChange={changeIsCustomLine}
          disabled={isLoading}
        />
        {LINE_WITHOUT_REFERENCE_LABEL}
      </Label>
      {!isCustomLine && (
        <form.AppField
          name="partReferenceId"
          children={(field) => (
            <field.PickerPart
              id="dialog-create-delivery-note-line-part"
              currentClientId={currentClientId}
              pickerMode={TablePartPickerMode.PickReferences}
              onRowSelect={(params) => {
                form.setFieldValue("partReferenceId", params?.partReferenceId ?? null);
                form.setFieldValue("partId", params?.partId ?? null);
                form.setFieldValue("description", params?.clientDescription ?? params?.description ?? null);
              }}
              disabled={isLoading}
            />
          )}
        />
      )}
      <form.AppField
        name="description"
        children={(field) => (
          <field.TextInput
            id="dialog-create-delivery-note-line-description"
            label={isCustomLine ? DESCRIPTION_LABEL : CLIENT_REFERENCE_DESCRIPTION_LABEL}
          />
        )}
      />
      {isAdmin ? (
        <FormPartPriceFields
          idPrefix="dialog-create-delivery-note-line"
          priceFieldName="unitPrice"
          currentClientId={currentClientId}
          isCustomLine={isCustomLine}
        />
      ) : (
        <form.AppField
          name="quantity"
          children={(field) => (
            <field.NumberInput id="dialog-create-delivery-note-line-quantity" label={QUANTITY_LABEL} min={-Infinity} />
          )}
        />
      )}
    </>
  );
}
