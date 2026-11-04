import type { NumberInputProps } from "@/components/ui/number-input";
import NumberInput from "@/components/ui/number-input";
import type { FieldLayoutProps } from "@/form/components/field-layout";
import FieldLayout from "@/form/components/field-layout";
import { useFieldContext, useFormContext } from "@/form/context";
import { isFieldRequired } from "@/form/utils";
import { FormMode } from "@/types";

interface FieldNumberInputProps
  extends Omit<NumberInputProps, "value" | "required">, Omit<FieldLayoutProps, "children" | "required"> {
  id: string;
  layoutClassName?: string;
}

export default function FieldNumberInput({
  id,
  label,
  tooltipContent,
  layoutClassName,
  onValueChange,
  onBlur,
  ...props
}: FieldNumberInputProps) {
  const field = useFieldContext<number | null>();
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
        value={field.state.value !== null ? String(field.state.value) : null}
        onValueChange={(value) => {
          field.handleChange(value !== null ? Number(value) : null);
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
