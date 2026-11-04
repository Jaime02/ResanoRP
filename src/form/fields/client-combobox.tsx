import ComboboxClient from "@/components/combobox/client";
import type { FieldModelComboboxProps } from "@/form/fields/model-combobox";
import FieldModelCombobox from "@/form/fields/model-combobox";
import { CLIENT_LABEL } from "@/messages/common";

export default function FieldClientCombobox(props: FieldModelComboboxProps) {
  return <FieldModelCombobox Combobox={ComboboxClient} label={CLIENT_LABEL} {...props} />;
}
