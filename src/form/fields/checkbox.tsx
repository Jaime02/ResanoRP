import { Checkbox } from "@/components/ui/checkbox";
import FieldLayout, { type FieldLayoutProps } from "@/form/components/field-layout";
import { useFieldContext, useFormContext } from "@/form/context";
import { cn } from "@/lib/utils";
import { FormMode } from "@/types";

interface FieldCheckboxProps {
  id: string;
  label?: string;
  labelPosition?: FieldLayoutProps["labelPosition"];
  layoutClassName?: string;
  showUncheckedIcon?: boolean;
}

export default function FieldCheckbox({
  id,
  label,
  labelPosition = "end",
  layoutClassName,
  showUncheckedIcon,
}: FieldCheckboxProps) {
  // A row synced into a field array renders once before useResetForm fills its value
  const field = useFieldContext<boolean | undefined>();
  const { formMode, isLoading } = useFormContext();
  return (
    <FieldLayout labelFor={id} label={label} labelPosition={labelPosition} className={cn("flex-row", layoutClassName)}>
      <Checkbox
        id={id}
        testId={id}
        checked={field.state.value ?? false}
        onCheckedChange={(checked) => {
          field.handleChange(checked);
        }}
        onBlur={field.handleBlur}
        readOnly={formMode === FormMode.ReadOnly}
        disabled={isLoading}
        showUncheckedIcon={showUncheckedIcon}
      />
    </FieldLayout>
  );
}
