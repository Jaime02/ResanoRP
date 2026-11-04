import { useFormContext } from "@/form";
import { NAME_LABEL } from "@/messages/common";

export default function FormCoating() {
  const { form } = useFormContext();
  return (
    <form.AppField
      name="name"
      children={(field) => <field.TextInput id="dialog-create-edit-coating-name" label={NAME_LABEL} />}
    />
  );
}
