import type { TextareaProps } from "@/components/ui/textarea";
import { Textarea } from "@/components/ui/textarea";
import FieldLayout from "@/form/components/field-layout";
import { useFieldContext, useFormContext } from "@/form/context";
import { isFieldRequired } from "@/form/utils";
import { FormMode } from "@/types";

interface FieldTextareaInputProps extends Omit<TextareaProps, "value" | "onChange" | "disabled" | "required"> {
  id: string;
  label: string;
  layoutClassName?: string;
}

export default function FieldTextareaInput({ id, label, layoutClassName, onBlur, ...props }: FieldTextareaInputProps) {
  const field = useFieldContext<string | null>();
  const { formMode, validationSchema } = useFormContext();
  const readOnly = formMode === FormMode.ReadOnly || props.readOnly === true;
  return (
    <FieldLayout
      labelFor={id}
      label={label}
      required={isFieldRequired(field.name, validationSchema) && !readOnly}
      className={layoutClassName}
    >
      <Textarea
        {...props}
        id={id}
        value={field.state.value ?? ""}
        onChange={(e) => {
          field.handleChange(e.target.value);
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
