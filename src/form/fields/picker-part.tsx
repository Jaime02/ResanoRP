import type { PickerPartProps } from "@/components/picker/picker-part";
import PickerPart from "@/components/picker/picker-part";
import FieldLayout from "@/form/components/field-layout";
import { useFieldContext, useFormContext } from "@/form/context";
import { isFieldRequired } from "@/form/utils";
import { SELECT_PART_PLACEHOLDER } from "@/messages/combobox";
import { FormMode } from "@/types";

interface FieldPickerPartProps extends PickerPartProps {
  id: string;
  layoutClassName?: string;
  currentClientId?: number | null;
}

export default function FieldPickerPart({
  id,
  label = SELECT_PART_PLACEHOLDER,
  layoutClassName,
  currentClientId,
  ...props
}: FieldPickerPartProps) {
  const field = useFieldContext<number | null>();
  const { formMode, isLoading, validationSchema } = useFormContext();
  const readOnly = formMode === FormMode.ReadOnly || props.disabled === true || isLoading;
  return (
    <FieldLayout
      labelFor={id}
      label={label}
      required={isFieldRequired(field.name, validationSchema) && !readOnly}
      className={layoutClassName}
    >
      <PickerPart id={id} currentClientId={currentClientId} label={label} {...props} disabled={readOnly} />
    </FieldLayout>
  );
}
