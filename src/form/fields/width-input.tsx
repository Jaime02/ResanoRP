import type { NumberInputProps } from "@/components/ui/number-input";
import NumberInput from "@/components/ui/number-input";
import type { FieldLayoutProps } from "@/form/components/field-layout";
import FieldLayout from "@/form/components/field-layout";
import { useFieldContext, useFormContext } from "@/form/context";
import { isFieldRequired } from "@/form/utils";
import { SIZE_LABEL } from "@/messages/common";
import { WIDTH_HEX_HINT_MESSAGE, WIDTH_ROUND_HINT_MESSAGE } from "@/messages/material";
import { FormMode } from "@/types";

interface FieldDecimalInputProps
  extends
    Omit<NumberInputProps, "value" | "required">,
    Omit<FieldLayoutProps, "children" | "required" | "label" | "tooltipContent"> {
  id: string;
  layoutClassName?: string;
}

export default function FieldWidthInput({
  id,
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
      label={SIZE_LABEL}
      required={isFieldRequired(field.name, validationSchema) && !readOnly}
      tooltipContent={
        <>
          {WIDTH_ROUND_HINT_MESSAGE}
          <br />
          {WIDTH_HEX_HINT_MESSAGE}
        </>
      }
      className={layoutClassName}
    >
      <NumberInput
        decimalScale={1}
        suffix=" mm"
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
