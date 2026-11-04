import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useFormContext } from "@/form";
import FormPartPriceFields from "@/form/forms/part-price-fields";
import { DESCRIPTION_LABEL, NOTES_LABEL } from "@/messages/common";
import { LINE_WITHOUT_REFERENCE_LABEL, REQUESTED_DELIVERY_DATE_LABEL } from "@/messages/sell-order";
import { TablePartPickerMode } from "@/types";

interface FormSellOrderLineProps {
  currentClientId?: number | null;
  editPartPriceId?: number;
  isCustomLine: boolean;
  changeIsCustomLine: (isCustomLine: boolean) => void;
}

export default function FormSellOrderLine({
  currentClientId,
  editPartPriceId,
  isCustomLine,
  changeIsCustomLine,
}: FormSellOrderLineProps) {
  const { form, isLoading } = useFormContext();

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
      {isCustomLine ? (
        <form.AppField
          name="description"
          children={(field) => (
            <field.TextInput id="dialog-create-sell-order-line-description" label={DESCRIPTION_LABEL} />
          )}
        />
      ) : (
        <form.AppField
          name="partReferenceId"
          children={(field) => (
            <field.PickerPart
              id="dialog-create-sell-order-line-part"
              currentClientId={currentClientId}
              pickerMode={TablePartPickerMode.PickReferences}
              onRowSelect={(params) => {
                form.setFieldValue("partReferenceId", params?.partReferenceId ?? null);
                form.setFieldValue("partId", params?.partId ?? null);
              }}
            />
          )}
        />
      )}
      <FormPartPriceFields
        idPrefix="dialog-create-sell-order-line"
        priceFieldName="partPrice"
        currentClientId={currentClientId}
        editPartPriceId={editPartPriceId}
        isCustomLine={isCustomLine}
      />
      <form.AppField
        name="requestedDeliveryDate"
        children={(field) => (
          <field.DateInput
            id="dialog-create-sell-order-line-requested-delivery-date"
            label={REQUESTED_DELIVERY_DATE_LABEL}
            disabled={isLoading}
          />
        )}
      />
      <form.AppField
        name="notes"
        children={(field) => <field.TextareaInput id="dialog-create-sell-order-line-notes" label={NOTES_LABEL} />}
      />
    </>
  );
}
