import { useFormContext } from "@/form";
import { NAME_LABEL } from "@/messages/common";
import { PAYMENT_METHOD_DUE_DAYS_LABEL, PAYMENT_METHOD_GENERATES_RECEIPT_LABEL } from "@/messages/payment-method";

export default function FormPaymentMethod() {
  const { form } = useFormContext();
  return (
    <>
      <form.AppField
        name="name"
        children={(field) => <field.TextInput id="dialog-create-edit-payment-method-name" label={NAME_LABEL} />}
      />
      <form.AppField
        name="paymentDeadlineDays"
        children={(field) => (
          <field.NumberInput
            id="dialog-create-edit-payment-method-payment-deadline-days"
            label={PAYMENT_METHOD_DUE_DAYS_LABEL}
            suffix=" días"
          />
        )}
      />
      <form.AppField
        name="generatesReceipt"
        children={(field) => (
          <field.Checkbox
            id="dialog-create-edit-payment-method-generates-receipt"
            label={PAYMENT_METHOD_GENERATES_RECEIPT_LABEL}
          />
        )}
      />
    </>
  );
}
