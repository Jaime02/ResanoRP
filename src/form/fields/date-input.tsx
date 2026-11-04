import type { DateInputProps } from "@/components/ui/date-input";
import DateInput from "@/components/ui/date-input";
import FieldLayout from "@/form/components/field-layout";
import { useFieldContext, useFormContext } from "@/form/context";
import { isFieldRequired } from "@/form/utils";
import { DATE_LABEL } from "@/messages/common";
import { FormMode } from "@/types";

interface FieldDateInputProps extends Omit<DateInputProps, "date"> {
  id: string;
  label?: string;
  layoutClassName?: string;
}

export default function FieldDateInput({
  id,
  label = DATE_LABEL,
  layoutClassName,
  onValueChange,
  onBlur,
  ...props
}: FieldDateInputProps) {
  const field = useFieldContext<Date | null>();
  const { formMode, isLoading, validationSchema } = useFormContext();
  const readOnly = formMode === FormMode.ReadOnly || props.disabled === true || isLoading;
  return (
    <FieldLayout
      labelFor={id}
      label={label}
      required={isFieldRequired(field.name, validationSchema) && !readOnly}
      className={layoutClassName}
    >
      <DateInput
        {...props}
        date={field.state.value}
        id={id}
        onValueChange={(date) => {
          field.handleChange(date);
          onValueChange?.(date);
        }}
        onBlur={() => {
          field.handleBlur();
          onBlur?.();
        }}
        disabled={readOnly}
      />
    </FieldLayout>
  );
}
