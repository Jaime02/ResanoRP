import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import MaintenanceDialog from "@/components/dialog/maintenance-dialog";
import { FormCreateBlueprint } from "@/form/forms/blueprint";
import useCreateBlueprintForm from "@/form/hooks/use-create-blueprint";
import { CREATE_BLUEPRINT_TITLE } from "@/messages/blueprint";
import { FormMode } from "@/types";

interface DialogCreateBlueprintProps {
  open?: boolean;
  partId?: number;
}

export default function DialogCreateBlueprint({ open, partId }: DialogCreateBlueprintProps) {
  const navigate = useNavigate();

  const onClose = useCallback(
    async () =>
      navigate({
        search: (prev) => ({ ...prev, createBlueprint: undefined }),
        to: ".",
      }),
    [navigate],
  );

  const { form, validationSchema, isLoading } = useCreateBlueprintForm({
    onSubmit: onClose,
    partId,
  });

  return (
    <MaintenanceDialog
      testId="dialog-create-blueprint"
      open={open === true}
      /* @ts-ignore File variable is causing a type error here */
      form={form}
      formMode={FormMode.Create}
      onClose={onClose}
      isLoading={isLoading}
      validationSchema={validationSchema}
      title={CREATE_BLUEPRINT_TITLE}
    >
      <FormCreateBlueprint />
    </MaintenanceDialog>
  );
}
