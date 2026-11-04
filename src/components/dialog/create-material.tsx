import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import MaintenanceDialog from "@/components/dialog/maintenance-dialog";
import FormMaterial from "@/form/forms/material";
import useCreateMaterialForm from "@/form/hooks/use-create-material";
import { MATERIAL_CREATE_TITLE } from "@/messages/material";
import { FormMode } from "@/types";

interface DialogCreateMaterialProps {
  open?: boolean;
}

export default function DialogCreateMaterial({ open }: DialogCreateMaterialProps) {
  const navigate = useNavigate();

  const onClose = useCallback(
    async () =>
      navigate({
        search: (prev) => ({ ...prev, createMaterial: undefined }),
        to: ".",
      }),
    [navigate],
  );

  const { form, validationSchema, isLoading } = useCreateMaterialForm({ onSubmit: onClose });

  return (
    <MaintenanceDialog
      testId="dialog-create-material"
      open={open === true}
      form={form}
      formMode={FormMode.Create}
      onClose={onClose}
      isLoading={isLoading}
      validationSchema={validationSchema}
      title={MATERIAL_CREATE_TITLE}
    >
      <FormMaterial />
    </MaintenanceDialog>
  );
}
