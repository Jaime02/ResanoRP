import { Combobox } from "@/components/ui/combobox";
import FieldLayout from "@/form/components/field-layout";
import { useFieldContext, useFormContext } from "@/form/context";
import { isFieldRequired } from "@/form/utils";
import { MATERIAL_LOT_UNIT_LABEL, MATERIAL_LOT_UNIT_LABELS } from "@/messages/material-lot";
import { FormMode } from "@/types";
import { MaterialLotUnit } from "@/types/material-lot";

// The combobox identifies its items by a numeric id, so each unit takes its position
const MATERIAL_LOT_UNIT_OPTIONS = Object.values(MaterialLotUnit).map((unit, index) => ({
  id: index + 1,
  name: MATERIAL_LOT_UNIT_LABELS[unit],
  unit,
}));

export default function FieldMaterialLotUnitCombobox({ id }: { id: string }) {
  const field = useFieldContext<MaterialLotUnit | null>();
  const { formMode, isLoading, validationSchema } = useFormContext();
  const readOnly = formMode === FormMode.ReadOnly || isLoading;

  return (
    <FieldLayout
      labelFor={id}
      label={MATERIAL_LOT_UNIT_LABEL}
      required={isFieldRequired(field.name, validationSchema) && !readOnly}
    >
      <Combobox
        id={id}
        testId={id}
        items={MATERIAL_LOT_UNIT_OPTIONS}
        take={MATERIAL_LOT_UNIT_OPTIONS.length}
        activeItem={MATERIAL_LOT_UNIT_OPTIONS.find((option) => option.unit === field.state.value) ?? null}
        formatItem={(item) => item?.name ?? ""}
        onValueChange={(item) => field.handleChange(item?.unit ?? null)}
        nullable={false}
        readOnly={readOnly}
      />
    </FieldLayout>
  );
}
