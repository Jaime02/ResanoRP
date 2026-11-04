import type { ComboboxModelProps } from "@/components/combobox/model";
import type { FieldLayoutProps } from "@/form/components/field-layout";
import FieldLayout from "@/form/components/field-layout";
import { useFieldContext, useFormContext } from "@/form/context";
import { isFieldRequired } from "@/form/utils";
import type { TBaseModel } from "@/schemas";
import { FormMode } from "@/types";

export interface FieldModelComboboxProps
  extends Omit<ComboboxModelProps<TBaseModel>, "activeItemId">, Omit<FieldLayoutProps, "children" | "required"> {
  layoutClassName?: string;
}

export default function FieldModelCombobox({
  Combobox,
  id,
  label,
  tooltipContent,
  layoutClassName,
  ...props
}: FieldModelComboboxProps & { Combobox: React.ComponentType<ComboboxModelProps<TBaseModel>> }) {
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
      <Combobox
        id={id}
        // A caller can replace it to decide whether the value changes, like when changing it needs a confirmation
        onValueChange={(value) => {
          field.handleChange(value?.id ?? null);
        }}
        activeItemId={field.state.value ?? undefined}
        {...props}
        readOnly={readOnly}
      />
    </FieldLayout>
  );
}
