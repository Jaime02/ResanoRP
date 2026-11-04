import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import MaintenanceDialog from "@/components/dialog/maintenance-dialog";
import FormMachine from "@/form/forms/machine";
import useFormMode from "@/form/hooks/use-form-mode";
import useMachineForm from "@/form/hooks/use-machine";
import { MACHINE_CREATE_TITLE } from "@/messages/machine";

interface CreateMachineDialogProps {
  createMachine?: boolean;
}

export default function CreateMachineDialog({ createMachine }: CreateMachineDialogProps) {
  const navigate = useNavigate();

  const requestedFormMode = useFormMode({ create: createMachine });

  const onClose = useCallback(
    async () =>
      navigate({
        search: (prev) => ({ ...prev, createMachine: undefined }),
        to: ".",
      }),
    [navigate],
  );

  const { form, formMode, validationSchema, isLoading } = useMachineForm({
    requestedFormMode,
    onSubmit: onClose,
  });

  return (
    <MaintenanceDialog
      testId="dialog-create-machine"
      open={createMachine === true}
      form={form}
      formMode={formMode}
      validationSchema={validationSchema}
      onClose={onClose}
      isLoading={isLoading}
      title={MACHINE_CREATE_TITLE}
    >
      <FormMachine />
    </MaintenanceDialog>
  );
}
