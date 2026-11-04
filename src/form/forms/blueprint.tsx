import { useCallback } from "react";

import { useFormContext } from "@/form";
import { BLUEPRINT_LABEL } from "@/messages/blueprint";
import { NAME_LABEL } from "@/messages/common";

export function FormEditBlueprint() {
  const { form } = useFormContext();
  return (
    <form.AppField
      name="fileName"
      children={(field) => <field.TextInput id="dialog-edit-blueprint-new-file-name" label={NAME_LABEL} />}
    />
  );
}

export function FormCreateBlueprint() {
  const { form } = useFormContext();
  const onBlueprintFileSelected = useCallback(
    (acceptedFiles: Array<File>) => {
      form.setFieldValue("fileName", acceptedFiles[0].name.replace(/\.pdf$/i, ""));
    },
    [form],
  );

  return (
    <div className="flex w-full flex-col gap-3">
      <form.AppField
        name="blueprint"
        children={(field) => (
          <field.FilesInput
            id="dialog-create-blueprint-blueprint"
            label={BLUEPRINT_LABEL}
            accept={{ "application/pdf": [] }}
            onValueChange={onBlueprintFileSelected}
          />
        )}
      />
      <form.AppField
        name="fileName"
        children={(field) => <field.TextInput id="dialog-create-blueprint-file-name" label={NAME_LABEL} />}
      />
    </div>
  );
}
