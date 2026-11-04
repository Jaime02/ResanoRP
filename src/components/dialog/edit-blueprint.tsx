import MaintenanceDialog from "@/components/dialog/maintenance-dialog";
import { FormEditBlueprint } from "@/form/forms/blueprint";
import useEditBlueprintForm from "@/form/hooks/use-edit-blueprint";
import { EDIT_BLUEPRINT_TITLE } from "@/messages/blueprint";
import type { TPartFormBlueprint } from "@/queries/part";
import { FormMode } from "@/types";

interface DialogEditBlueprintProps {
  blueprint: TPartFormBlueprint | null;
  onClose: () => Promise<void>;
}

export default function DialogEditBlueprint({ blueprint, onClose }: DialogEditBlueprintProps) {
  const { form, validationSchema, isLoading } = useEditBlueprintForm({
    blueprint,
    onSubmit: onClose,
  });

  return (
    <MaintenanceDialog
      testId="dialog-edit-blueprint"
      open={blueprint !== null}
      form={form}
      formMode={FormMode.Update}
      isLoading={isLoading}
      onClose={onClose}
      title={EDIT_BLUEPRINT_TITLE}
      validationSchema={validationSchema}
    >
      <FormEditBlueprint />
    </MaintenanceDialog>
  );
}
