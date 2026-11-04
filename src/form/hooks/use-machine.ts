import { useSelector } from "@tanstack/react-store";

import machineCollection from "@/collections/machine";
import { useAppContext } from "@/contexts/app-context";
import { useAppForm } from "@/form";
import useResetForm from "@/form/hooks/use-reset-form";
import { MACHINE_CREATED_MESSAGE, MACHINE_EDITED_MESSAGE } from "@/messages/machine";
import { useQueryMachineById } from "@/queries/machine";
import { createMachineSchema, updateMachineSchema } from "@/schemas/machine";
import type { TCreateMachine, TUpdateMachine } from "@/schemas/machine";
import trpc from "@/trpc/trpc-client";
import { FormMode } from "@/types";
import type { BaseMachineSerialized } from "@/types/machine";

const defaultMachineFormData: { name: string | null; minDiameter: number | null; maxDiameter: number | null } = {
  maxDiameter: null,
  minDiameter: null,
  name: null,
};

const schemas = {
  [FormMode.Create]: createMachineSchema,
  [FormMode.Update]: updateMachineSchema,
  [FormMode.ReadOnly]: undefined,
  [FormMode.NotApplicable]: undefined,
};

interface UseMachineFormProps {
  requestedFormMode: FormMode;
  editMachineId?: number;
  onSubmit?: (machine: BaseMachineSerialized) => Promise<void>;
}

export default function useMachineForm({ requestedFormMode, editMachineId, onSubmit }: UseMachineFormProps) {
  const { showToastOnTRPCMutation } = useAppContext();

  const { data: machine, isLoading: isLoadingMachine, isLoadingError, isCrashed } = useQueryMachineById(editMachineId);

  const formMode =
    machine?.deletedAt != null || requestedFormMode === FormMode.ReadOnly ? FormMode.ReadOnly : requestedFormMode;
  const validationSchema = schemas[formMode];

  const defaultValues = {
    ...(formMode !== FormMode.Create ? { id: machine?.id } : {}),
    maxDiameter: formMode === FormMode.Create ? defaultMachineFormData.maxDiameter : (machine?.maxDiameter ?? null),
    minDiameter: formMode === FormMode.Create ? defaultMachineFormData.minDiameter : (machine?.minDiameter ?? null),
    name: formMode === FormMode.Create ? defaultMachineFormData.name : (machine?.name ?? null),
  };

  const form = useAppForm({
    formId: "machine",
    defaultValues,
    onSubmit: async ({ value: machineFormData }) => {
      if (formMode !== FormMode.Create && formMode !== FormMode.Update) return;
      const mutation =
        formMode === FormMode.Create
          ? trpc.machine.create.mutate(machineFormData as TCreateMachine)
          : trpc.machine.update.mutate(machineFormData as TUpdateMachine);
      await showToastOnTRPCMutation({
        mutation,
        onSuccess: { title: formMode === FormMode.Create ? MACHINE_CREATED_MESSAGE : MACHINE_EDITED_MESSAGE },
        collection: machineCollection,
        onSubmit,
      });
    },
    validators: {
      onSubmit: validationSchema,
    },
  });

  const isSubmitting = useSelector(form.store, (state) => state.isSubmitting);

  useResetForm(form, defaultValues, formMode);

  const isLoading = isLoadingMachine || isSubmitting;

  return {
    machine,
    validationSchema,
    form,
    formMode,
    getMachineByIdError:
      isLoadingError || isCrashed || (editMachineId !== undefined && !isLoadingMachine && machine === undefined),
    isLoading,
  };
}

export type TMachineForm = NonNullable<ReturnType<typeof useMachineForm>["machine"]>;
