import ComboboxShape from "@/components/combobox/shape";
import type { FieldModelComboboxProps } from "@/form/fields/model-combobox";
import FieldModelCombobox from "@/form/fields/model-combobox";
import { SHAPE_LABEL } from "@/messages/common";

export default function FieldShapeCombobox(props: FieldModelComboboxProps) {
  return <FieldModelCombobox Combobox={ComboboxShape} label={SHAPE_LABEL} {...props} />;
}
