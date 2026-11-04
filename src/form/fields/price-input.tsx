import type { PriceInputProps } from "@/components/ui/price-input";
import PriceInput from "@/components/ui/price-input";
import FieldLayout from "@/form/components/field-layout";
import { useFieldContext, useFormContext } from "@/form/context";
import { isFieldRequired } from "@/form/utils";
import { FormMode } from "@/types";

interface FieldPriceInputProps extends Omit<PriceInputProps, "value" | "required"> {
  id: string;
  label: React.ReactNode;
  layoutClassName?: string;
}

export default function FieldPriceInput({ id, label, layoutClassName, onValueChange, ...props }: FieldPriceInputProps) {
  const field = useFieldContext<string | null>();
  const { formMode, isLoading, validationSchema } = useFormContext();
  const readOnly = formMode === FormMode.ReadOnly || props.readOnly === true || isLoading;

  return (
    <FieldLayout
      labelFor={id}
      label={label}
      required={isFieldRequired(field.name, validationSchema) && !readOnly}
      className={layoutClassName}
    >
      <PriceInput
        id={id}
        value={field.state.value}
        onValueChange={(updater) => {
          field.handleChange(updater);
          onValueChange?.(updater);
        }}
        onBlur={field.handleBlur}
        readOnly={readOnly}
        className={props.className}
        min={props.min}
      />
    </FieldLayout>
  );
}
