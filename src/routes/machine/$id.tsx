import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { TriangleAlertIcon } from "lucide-react";
import { z } from "zod";

import DialogQueryError from "@/components/dialog/query-error";
import ButtonRestoreModel from "@/components/table/button-restore-model";
import TableMachineProductionHistory from "@/components/table/machine-production-history";
import { Badge } from "@/components/ui/badge";
import ButtonLink from "@/components/ui/button-link";
import { useAppContext } from "@/contexts/app-context";
import { FormContextProvider } from "@/form";
import FormMachine from "@/form/forms/machine";
import useMachineForm from "@/form/hooks/use-machine";
import { serializeMachine } from "@/lib/serializers";
import { MACHINE_LABEL, RESTORE_LABEL } from "@/messages/common";
import {
  MACHINE_FETCH_ERROR_MESSAGE,
  MACHINE_FETCH_ERROR_TITLE,
  MACHINE_RESTORE_MESSAGE,
  MACHINE_RESTORE_TITLE,
  MACHINE_DELETED_MESSAGE,
  MACHINE_RESTORED_MESSAGE,
  MACHINE_EDIT_TITLE,
  VIEW_MACHINES_LABEL,
} from "@/messages/machine";
import { PRODUCTION_HISTORY_PAGE_TITLE } from "@/messages/production-order";
import trpc from "@/trpc/trpc-client";
import { FormMode } from "@/types";

const routeParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const Route = createFileRoute("/machine/$id")({
  beforeLoad: () => ({
    title: MACHINE_LABEL,
  }),
  component: RouteComponent,
  params: routeParamsSchema,
});

function RouteComponent() {
  const { id: machineId } = Route.useParams();

  const { isAdmin, showToastOnTRPCMutation } = useAppContext();
  const navigate = useNavigate();

  const requestedFormMode = isAdmin ? FormMode.Update : FormMode.ReadOnly;

  const { form, formMode, validationSchema, machine, isLoading, getMachineByIdError } = useMachineForm({
    editMachineId: machineId,
    requestedFormMode,
  });

  if (getMachineByIdError) {
    return (
      <DialogQueryError
        testId="dialog-error-get-machine-by-id-query"
        title={MACHINE_FETCH_ERROR_TITLE}
        errorMessage={MACHINE_FETCH_ERROR_MESSAGE}
        onClose={() => void navigate({ search: { tab: "machine" }, to: "/maintenance" })}
      />
    );
  }

  return (
    <FormContextProvider
      testId="form-machine"
      form={form}
      formMode={formMode}
      isLoading={isLoading}
      validationSchema={validationSchema}
      className="items-center"
    >
      {machine?.deletedAt && (
        <div className="flex flex-row items-center gap-2">
          <Badge variant="destructive" size="lg">
            <TriangleAlertIcon className="size-icon" />
            {MACHINE_DELETED_MESSAGE}
          </Badge>
          <ButtonRestoreModel
            dialogTitle={MACHINE_RESTORE_TITLE}
            dialogDescription={MACHINE_RESTORE_MESSAGE}
            serializedModel={serializeMachine(machine)}
            triggerExtraComponents={RESTORE_LABEL}
            size="default"
            onConfirm={() =>
              void showToastOnTRPCMutation({
                mutation: trpc.machine.restore.mutate({ id: machine.id }),
                onSuccess: { title: MACHINE_RESTORED_MESSAGE },
              })
            }
          />
        </div>
      )}
      <ButtonLink to="/maintenance" search={{ tab: "machine" }} className="self-start">
        {VIEW_MACHINES_LABEL}
      </ButtonLink>
      <div className="mx-auto flex w-fit flex-col items-start gap-3">
        <FormMachine />
      </div>
      <TableMachineProductionHistory title={PRODUCTION_HISTORY_PAGE_TITLE} machineId={machineId} />
      {formMode !== FormMode.ReadOnly && <form.ButtonSubmit className="self-end" customText={MACHINE_EDIT_TITLE} />}
    </FormContextProvider>
  );
}
