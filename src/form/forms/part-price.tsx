import { useFormContext } from "@/form";
import { PRICE_LABEL, QUANTITY_LABEL } from "@/messages/common";

interface FormPartPriceProps {
  showClient?: boolean;
}

export default function FormPartPrice({ showClient = true }: FormPartPriceProps) {
  const { form } = useFormContext();
  return (
    <>
      <div className="flex flex-row gap-2">
        <form.AppField
          name="price"
          children={(field) => <field.PriceInput id="input-price-create-edit-part-price-dialog" label={PRICE_LABEL} />}
        />
        <form.AppField
          name="quantity"
          children={(field) => (
            <field.NumberInput id="input-quantity-create-edit-part-price-dialog" label={QUANTITY_LABEL} />
          )}
        />
      </div>
      {showClient && (
        <form.AppField
          name="clientId"
          children={(field) => (
            <field.ClientCombobox testId="combobox-client" id="input-client-create-edit-part-price-dialog" nullable />
          )}
        />
      )}
      <form.AppField
        name="createdAt"
        children={(field) => <field.DateInput id="input-created-at-create-edit-part-price-dialog" />}
      />
    </>
  );
}
