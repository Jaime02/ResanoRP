import ComboboxPaymentMethod from "@/components/combobox/payment-method";
import type { FieldModelComboboxProps } from "@/form/fields/model-combobox";
import FieldModelCombobox from "@/form/fields/model-combobox";
import { PAYMENT_METHOD_LABEL } from "@/messages/common";

export default function FieldPaymentMethodCombobox(props: FieldModelComboboxProps) {
  return <FieldModelCombobox Combobox={ComboboxPaymentMethod} label={PAYMENT_METHOD_LABEL} {...props} />;
}
