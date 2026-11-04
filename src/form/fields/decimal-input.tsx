import type { NumberInputProps } from "@/components/ui/number-input";
import NumberInput from "@/components/ui/number-input";
import type { FieldLayoutProps } from "@/form/components/field-layout";
import FieldLayout from "@/form/components/field-layout";
import { useFieldContext, useFormContext } from "@/form/context";
import { isFieldRequired } from "@/form/utils";
import { FormMode } from "@/types";

interface FieldDecimalInputProps
  extends Omit<NumberInputProps, "value" | "required">, Omit<FieldLayoutProps, "children" | "required"> {
  id: string;
  layoutClassName?: string;
}

export default function FieldDecimalInput({
  id,
  label,
  tooltipContent,
  layoutClassName,
  onValueChange,
  onBlur,
  ...props
}: FieldDecimalInputProps) {
  const field = useFieldContext<string | null>();
  const { formMode, isLoading, validationSchema } = useFormContext();
  const readOnly = formMode === FormMode.ReadOnly || props.readOnly === true || isLoading;
  return (
    <FieldLayout
      labelFor={id}
      label={label}
      required={isFieldRequired(field.name, validationSchema) && !readOnly}
      tooltipContent={tooltipContent}
      className={layoutClassName}
    >
      <NumberInput
        {...props}
        id={id}
        value={field.state.value}
        onValueChange={(value) => {
          field.handleChange(value);
          onValueChange?.(value);
        }}
        onBlur={(e) => {
          field.handleBlur();
          onBlur?.(e);
        }}
        readOnly={readOnly}
      />
    </FieldLayout>
  );
}
