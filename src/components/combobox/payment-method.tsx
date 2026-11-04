import type { ComboboxModelProps } from "@/components/combobox/model";
import ComboboxModel from "@/components/combobox/model";
import { NO_PAYMENT_METHODS_MESSAGE, SELECT_PAYMENT_METHOD_PLACEHOLDER } from "@/messages/combobox";
import { useQueryPaymentMethodById, useQueryPaymentMethods } from "@/queries/payment-method";
import type { BasePaymentMethod } from "@/types/payment-method";

export default function ComboboxPaymentMethod(props: ComboboxModelProps<BasePaymentMethod>) {
  // Looked up apart from the options, which leave deleted Formas de pago out, so the history that points to one still
  // shows it
  const { data: activePaymentMethod } = useQueryPaymentMethodById(props.activeItemId);

  return (
    <ComboboxModel
      modelName="PaymentMethods"
      useQueryItems={useQueryPaymentMethods}
      activeItem={activePaymentMethod ?? null}
      placeholder={SELECT_PAYMENT_METHOD_PLACEHOLDER}
      noItemsMessage={NO_PAYMENT_METHODS_MESSAGE}
      {...props}
    />
  );
}
