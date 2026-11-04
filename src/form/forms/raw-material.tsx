import { useFormContext } from "@/form";
import { NAME_LABEL } from "@/messages/common";
import { RAW_MATERIAL_DENSITY_LABEL, RAW_MATERIAL_PRICE_LABEL } from "@/messages/material";

export default function FormRawMaterial() {
  const { form } = useFormContext();
  return (
    <>
      <form.AppField
        name="name"
        children={(field) => <field.TextInput id="dialog-create-edit-raw-material-name" label={NAME_LABEL} />}
      />
      <form.AppField
        name="price"
        children={(field) => (
          <field.PriceInput id="dialog-create-edit-raw-material-price" label={RAW_MATERIAL_PRICE_LABEL} />
        )}
      />
      <form.AppField
        name="density"
        children={(field) => (
          <field.DecimalInput
            id="dialog-create-edit-raw-material-density"
            label={RAW_MATERIAL_DENSITY_LABEL}
            suffix=" g/cm³"
            decimalScale={3}
          />
        )}
      />
    </>
  );
}
