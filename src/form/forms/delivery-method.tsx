import { useFormContext } from "@/form";
import { NAME_LABEL } from "@/messages/common";

export default function FormDeliveryMethod() {
  const { form } = useFormContext();
  return (
    <form.AppField
      name="name"
      children={(field) => <field.TextInput id="dialog-create-edit-delivery-method-name" label={NAME_LABEL} />}
    />
  );
}
