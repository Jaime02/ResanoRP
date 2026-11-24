import { useFormContext } from "@/form";
import { IP_LABEL } from "@/messages/backoffice";
import { NAME_LABEL } from "@/messages/common";

export default function FormUser() {
  const { form } = useFormContext();
  return (
    <>
      <form.AppField
        name="name"
        children={(field) => <field.TextInput id="dialog-create-edit-user-name" label={NAME_LABEL} />}
      />
      <form.AppField
        name="ip"
        children={(field) => <field.TextInput id="dialog-create-edit-user-ip" label={IP_LABEL} />}
      />
    </>
  );
}
