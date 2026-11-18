import { Combobox } from "@/components/ui/combobox";
import FieldLayout from "@/form/components/field-layout";
import { useFieldContext, useFormContext } from "@/form/context";
import { isFieldRequired } from "@/form/utils";
import { PRINTER_KIND_LABEL, PRINTER_KIND_LABELS } from "@/messages/printer";
import { FormMode } from "@/types";
import { PrinterKind } from "@/types/printer";

// The combobox identifies its items by a numeric id, so each kind takes its position
const PRINTER_KIND_OPTIONS = Object.values(PrinterKind).map((kind, index) => ({
  id: index + 1,
  kind,
  name: PRINTER_KIND_LABELS[kind],
}));

export default function FieldPrinterKindCombobox({ id }: { id: string }) {
  const field = useFieldContext<PrinterKind | null>();
  const { formMode, isLoading, validationSchema } = useFormContext();
  const readOnly = formMode === FormMode.ReadOnly || isLoading;

  return (
    <FieldLayout
      labelFor={id}
      label={PRINTER_KIND_LABEL}
      required={isFieldRequired(field.name, validationSchema) && !readOnly}
    >
      <Combobox
        id={id}
        items={PRINTER_KIND_OPTIONS}
        take={PRINTER_KIND_OPTIONS.length}
        activeItem={PRINTER_KIND_OPTIONS.find((option) => option.kind === field.state.value) ?? null}
        formatItem={(item) => item?.name ?? ""}
        onValueChange={(item) => {
          field.handleChange(item?.kind ?? null);
        }}
        nullable={false}
        readOnly={readOnly}
      />
    </FieldLayout>
  );
}
