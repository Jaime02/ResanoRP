import type { InputProps } from "@/components/ui/input";
import { Input } from "@/components/ui/input";
import FieldLayout from "@/form/components/field-layout";
import { useFieldContext, useFormContext } from "@/form/context";
import { isFieldRequired } from "@/form/utils";
import { FormMode } from "@/types";

interface FieldTextInputProps extends Omit<InputProps, "value" | "onChange" | "onBlur" | "disabled" | "required"> {
  id: string;
  label?: string;
  layoutClassName?: string;
}

export default function FieldTextInput({ id, label, layoutClassName, ...props }: FieldTextInputProps) {
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
      <Input
        {...props}
        id={id}
        value={field.state.value}
        onChange={(e) => {
          field.handleChange(e.target.value);
        }}
        onBlur={field.handleBlur}
        readOnly={readOnly}
      />
    </FieldLayout>
  );
}
