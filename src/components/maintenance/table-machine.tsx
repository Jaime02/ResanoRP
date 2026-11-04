import { useDbClient } from "@tanstack/react-db";
import { useNavigate } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { useCallback, useMemo } from "react";

import machineCollection from "@/collections/machine";
import CreateMachineDialog from "@/components/dialog/create-machine";
import PopoverDeletedFilter from "@/components/popover/deleted-filter";
import type { PublicBaseTableProps } from "@/components/table/base-table";
import BaseTable from "@/components/table/base-table";
import { createTableColumnHelper } from "@/components/table/column-helper";
import ButtonLink from "@/components/ui/button-link";
import { ModelActions } from "@/components/ui/model-actions";
import { useAppContext } from "@/contexts/app-context";
import type { TMachineForm } from "@/form/hooks/use-machine";
import { serializeMachine } from "@/lib/serializers";
import { ACTIONS_LABEL, NAME_LABEL } from "@/messages/common";
import {
  MACHINE_DELETE_MESSAGE,
  MACHINE_DELETE_TITLE,
  MACHINE_DELETED_MESSAGE,
  MACHINE_RESTORE_MESSAGE,
  MACHINE_RESTORE_TITLE,
  MACHINE_RESTORED_MESSAGE,
  MACHINE_CREATE_TITLE,
  SHOW_DELETED_MACHINES_LABEL,
} from "@/messages/machine";
import { useQueryMachines } from "@/queries/machine";
import type { TTableMachineState } from "@/schemas/machine";
import trpc from "@/trpc/trpc-client";
import { CellDataType } from "@/types";

const DEFAULT_STATE: TTableMachineState = { sorts: [{ desc: false, id: "name" }] };

interface TableMaintenanceMachineProps extends PublicBaseTableProps<TMachineForm, TTableMachineState> {
  createMachine?: boolean;
}

const columnHelper = createTableColumnHelper<TMachineForm>();

export default function TableMaintenanceMachine({ createMachine, ...props }: TableMaintenanceMachineProps) {
  const navigate = useNavigate();
  const dbClient = useDbClient();
  const { showToastOnTransaction, showToastOnTRPCMutation } = useAppContext();

  const { data: machines, isLoading: isLoadingMachines } = useQueryMachines({
    filters: props.state?.filters ?? DEFAULT_STATE.filters,
    sorts: props.state?.sorts ?? DEFAULT_STATE.sorts,
  });

  const handleEdit = useCallback(
    async (machineId: number) => {
      await navigate({
        params: { id: machineId },
        to: "/machine/$id",
      });
    },
    [navigate],
  );

  const columns = useMemo(
    () => [
      columnHelper.accessor("name", {
        enableColumnFilter: true,
        header: NAME_LABEL,
        id: "name",
        meta: { dataType: CellDataType.String },
      }),
      columnHelper.display({
        cell: ({ row }) => (
          <ModelActions
            disabled={props.isLoading === true || isLoadingMachines}
            onEdit={() => void handleEdit(row.original.id)}
            {...(row.original.deletedAt === null
              ? {
                  deleteButton: {
                    dialogTitle: MACHINE_DELETE_TITLE,
                    dialogDescription: MACHINE_DELETE_MESSAGE,
                    serializedModel: serializeMachine(row.original),
                    onConfirm: () =>
                      void showToastOnTransaction({
                        transaction: () =>
                          dbClient.collection(machineCollection).delete(row.original.id, {
                            optimistic: import.meta.env.VITE_ENV_NAME !== "test",
                          }),
                        onSuccess: { title: MACHINE_DELETED_MESSAGE },
                      }),
                  },
                }
              : {
                  restoreButton: {
                    dialogTitle: MACHINE_RESTORE_TITLE,
                    dialogDescription: MACHINE_RESTORE_MESSAGE,
                    serializedModel: serializeMachine(row.original),
                    onConfirm: () =>
                      void showToastOnTRPCMutation({
                        mutation: trpc.machine.restore.mutate({ id: row.original.id }),
                        onSuccess: { title: MACHINE_RESTORED_MESSAGE },
                        collection: machineCollection,
                      }),
                  },
                })}
          />
        ),
        header: ACTIONS_LABEL,
        id: "actions",
      }),
    ],
    [props.isLoading, isLoadingMachines, handleEdit, dbClient, showToastOnTransaction, showToastOnTRPCMutation],
  );

  return (
    <>
      <BaseTable
        testId="table-machine"
        columns={columns}
        rows={machines}
        isLoading={props.isLoading === true || isLoadingMachines}
        customFiltersComponent={
          <PopoverDeletedFilter
            label={SHOW_DELETED_MACHINES_LABEL}
            filters={props.state?.filters}
            tableName="table-machine"
            defaultState={props.defaultState ?? DEFAULT_STATE}
            onStateChange={props.onStateChange}
          />
        }
        headerExtraComponents={
          <ButtonLink variant="success" to="." search={(prev) => ({ ...prev, createMachine: true })}>
            <PlusIcon /> {MACHINE_CREATE_TITLE}
          </ButtonLink>
        }
        defaultState={DEFAULT_STATE}
        {...props}
      />
      <CreateMachineDialog createMachine={createMachine} />
    </>
  );
}
