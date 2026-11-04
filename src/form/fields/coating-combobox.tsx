import ComboboxCoating from "@/components/combobox/coating";
import type { FieldModelComboboxProps } from "@/form/fields/model-combobox";
import FieldModelCombobox from "@/form/fields/model-combobox";
import { COATING_LABEL } from "@/messages/common";

export default function FieldCoatingCombobox(props: FieldModelComboboxProps) {
  return <FieldModelCombobox Combobox={ComboboxCoating} label={COATING_LABEL} {...props} />;
}
