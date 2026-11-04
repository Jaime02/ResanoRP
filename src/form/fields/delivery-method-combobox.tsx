import ComboboxDeliveryMethod from "@/components/combobox/delivery-method";
import type { FieldModelComboboxProps } from "@/form/fields/model-combobox";
import FieldModelCombobox from "@/form/fields/model-combobox";
import { DELIVERY_METHOD_LABEL } from "@/messages/common";

export default function FieldDeliveryMethodCombobox(props: FieldModelComboboxProps) {
  return <FieldModelCombobox Combobox={ComboboxDeliveryMethod} label={DELIVERY_METHOD_LABEL} {...props} />;
}
