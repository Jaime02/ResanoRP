import type { DropzoneProps } from "@/components/ui/dropzone";
import { Dropzone } from "@/components/ui/dropzone";
import FieldLayout from "@/form/components/field-layout";
import { useFieldContext, useFormContext } from "@/form/context";
import { isFieldRequired } from "@/form/utils";
import clientLog from "@/logging/clientLog";
import { LoggerLevels } from "@/logging/types";
import { FormMode } from "@/types";

interface FieldFileInputProps extends Omit<DropzoneProps, "filterFieldName" | "onDrop" | "required"> {
  id: string;
  testId?: string;
  label: string;
  layoutClassName?: string;
  onValueChange?: (files: Array<File>) => void;
  allowMultipleFiles?: boolean;
}

export default function FieldFilesInput({
  id,
  testId,
  label,
  layoutClassName,
  onValueChange,
  ...props
}: FieldFileInputProps) {
  const field = useFieldContext<File | Array<File> | null>();
  const { formMode, isLoading, validationSchema } = useFormContext();
  const isRequired = isFieldRequired(field.name, validationSchema);
  const readOnly = formMode === FormMode.ReadOnly || props.disabled === true || isLoading;
  return (
    <FieldLayout labelFor={id} label={label} required={isRequired && !readOnly} className={layoutClassName}>
      <Dropzone
        id={id}
        testId={testId}
        filterFieldName={field.name}
        onDrop={(acceptedFiles) => {
          onValueChange?.(acceptedFiles);
          field.handleChange(props.allowMultipleFiles === true ? acceptedFiles : acceptedFiles[0]);
        }}
        onClear={() => field.handleChange(props.allowMultipleFiles === true ? [] : null)}
        onError={(error) => void clientLog(LoggerLevels.debug, "Dropzone error", { error })}
        src={field.state.value}
        disabled={readOnly}
        required={isRequired}
        {...props}
      />
    </FieldLayout>
  );
}
