import { useFormContext } from "@/form";
import { SHAPE_LABEL } from "@/messages/common";
import { RAW_MATERIAL_LABEL } from "@/messages/material";

export default function FormMaterial() {
  const { form } = useFormContext();
  return (
    <>
      <form.AppField
        name="rawMaterialId"
        children={(field) => (
          <field.RawMaterialCombobox id="input-raw-material-create-material" label={RAW_MATERIAL_LABEL} />
        )}
      />
      <form.AppField
        name="shapeId"
        children={(field) => <field.ShapeCombobox id="input-shape-create-material" label={SHAPE_LABEL} />}
      />
      <form.AppField name="width" children={(field) => <field.WidthInput id="input-width-create-material" />} />
    </>
  );
}
