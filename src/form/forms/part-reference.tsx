import { useFormContext } from "@/form";
import { REFERENCE_LABEL } from "@/messages/common";
import { CLIENT_REFERENCE_DESCRIPTION_LABEL } from "@/messages/part";

export default function FormPartReference() {
  const { form } = useFormContext();
  return (
    <>
      <form.AppField
        name="reference"
        children={(field) => (
          <field.TextInput
            id="input-reference-edit-part-reference-dialog"
            testId="input-reference"
            label={REFERENCE_LABEL}
          />
        )}
      />
      <form.AppField
        name="clientDescription"
        children={(field) => (
          <field.TextInput
            id="input-client-description-edit-part-reference-dialog"
            label={CLIENT_REFERENCE_DESCRIPTION_LABEL}
          />
        )}
      />
      <form.AppField
        name="clientId"
        children={(field) => (
          <field.ClientCombobox
            testId="combobox-client"
            id="combobox-client-dialog-create-edit-part-reference"
            nullable
          />
        )}
      />
    </>
  );
}
