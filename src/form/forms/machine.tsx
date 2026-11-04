import { useFormContext } from "@/form";
import { NAME_LABEL } from "@/messages/common";
import { MACHINE_MAX_DIAMETER_LABEL, MACHINE_MIN_DIAMETER_LABEL } from "@/messages/machine";

export default function FormMachine() {
  const { form } = useFormContext();
  return (
    <>
      <form.AppField
        name="name"
        children={(field) => <field.TextInput id="dialog-create-edit-machine-name" label={NAME_LABEL} />}
      />
      <form.AppField
        name="minDiameter"
        children={(field) => (
          <field.NumberInput
            id="dialog-create-edit-machine-min-diameter"
            label={MACHINE_MIN_DIAMETER_LABEL}
            suffix=" mm"
          />
        )}
      />
      <form.AppField
        name="maxDiameter"
        children={(field) => (
          <field.NumberInput
            id="dialog-create-edit-machine-max-diameter"
            label={MACHINE_MAX_DIAMETER_LABEL}
            suffix=" mm"
          />
        )}
      />
    </>
  );
}
