import ComboboxRawMaterial from "@/components/combobox/raw-material";
import type { FieldModelComboboxProps } from "@/form/fields/model-combobox";
import FieldModelCombobox from "@/form/fields/model-combobox";
import { RAW_MATERIAL_LABEL } from "@/messages/material";

export default function FieldRawMaterialCombobox(props: FieldModelComboboxProps) {
  return <FieldModelCombobox Combobox={ComboboxRawMaterial} label={RAW_MATERIAL_LABEL} {...props} />;
}
