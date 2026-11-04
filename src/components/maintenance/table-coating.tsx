import { useDbClient } from "@tanstack/react-db";
import { useNavigate } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { useMemo } from "react";

import coatingCollection from "@/collections/coating";
import CreateEditCoatingDialog from "@/components/dialog/create-edit-coating";
import PopoverDeletedFilter from "@/components/popover/deleted-filter";
import type { PublicBaseTableProps } from "@/components/table/base-table";
import BaseTable from "@/components/table/base-table";
import { createTableColumnHelper } from "@/components/table/column-helper";
import ButtonLink from "@/components/ui/button-link";
import { ModelActions } from "@/components/ui/model-actions";
import { useAppContext } from "@/contexts/app-context";
import type { TCoatingForm } from "@/form/hooks/use-coating";
import { serializeCoating } from "@/lib/serializers";
import {
  COATING_DELETE_MESSAGE,
  COATING_DELETE_TITLE,
  COATING_DELETED_MESSAGE,
  COATING_RESTORE_MESSAGE,
  COATING_RESTORE_TITLE,
  COATING_RESTORED_MESSAGE,
  COATING_CREATE_TITLE,
  SHOW_DELETED_COATINGS_LABEL,
} from "@/messages/coating";
import { ACTIONS_LABEL, NAME_LABEL } from "@/messages/common";
import { useQueryCoatings } from "@/queries/coating";
import type { TTableCoatingState } from "@/schemas/coating";
import trpc from "@/trpc/trpc-client";
import { CellDataType } from "@/types";

const DEFAULT_STATE: TTableCoatingState = { sorts: [{ desc: false, id: "name" }] };

interface TableMaintenanceCoatingProps extends PublicBaseTableProps<TCoatingForm, TTableCoatingState> {
  editCoatingId?: number;
  createCoating?: boolean;
}

const columnHelper = createTableColumnHelper<TCoatingForm>();

export default function TableMaintenanceCoating({
  editCoatingId,
  createCoating,
  ...props
}: TableMaintenanceCoatingProps) {
  const navigate = useNavigate();
  const dbClient = useDbClient();
  const { showToastOnTransaction, showToastOnTRPCMutation } = useAppContext();

  const { data: coatings, isLoading: isLoadingCoatings } = useQueryCoatings({
    filters: props.state?.filters ?? DEFAULT_STATE.filters,
    sorts: props.state?.sorts ?? DEFAULT_STATE.sorts,
  });

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
            disabled={props.isLoading === true || isLoadingCoatings}
            {...(row.original.deletedAt === null
              ? {
                  onEdit: () =>
                    void navigate({
                      search: (prev) => ({ ...prev, editCoatingId: row.original.id }),
                      to: ".",
                    }),
                  deleteButton: {
                    dialogTitle: COATING_DELETE_TITLE,
                    dialogDescription: COATING_DELETE_MESSAGE,
                    serializedModel: serializeCoating(row.original),
                    onConfirm: () =>
                      void showToastOnTransaction({
                        transaction: () =>
                          dbClient.collection(coatingCollection).delete(row.original.id, {
                            optimistic: import.meta.env.VITE_ENV_NAME !== "test",
                          }),
                        onSuccess: { title: COATING_DELETED_MESSAGE },
                      }),
                  },
                }
              : {
                  restoreButton: {
                    dialogTitle: COATING_RESTORE_TITLE,
                    dialogDescription: COATING_RESTORE_MESSAGE,
                    serializedModel: serializeCoating(row.original),
                    onConfirm: () =>
                      void showToastOnTRPCMutation({
                        mutation: trpc.coating.restore.mutate({ id: row.original.id }),
                        onSuccess: { title: COATING_RESTORED_MESSAGE },
                        collection: coatingCollection,
                      }),
                  },
                })}
          />
        ),
        header: ACTIONS_LABEL,
        id: "actions",
      }),
    ],
    [props.isLoading, isLoadingCoatings, navigate, dbClient, showToastOnTransaction, showToastOnTRPCMutation],
  );

  return (
    <>
      <BaseTable
        testId="table-coating"
        columns={columns}
        rows={coatings}
        isLoading={props.isLoading === true || isLoadingCoatings}
        customFiltersComponent={
          <PopoverDeletedFilter
            label={SHOW_DELETED_COATINGS_LABEL}
            filters={props.state?.filters}
            tableName="table-coating"
            defaultState={props.defaultState ?? DEFAULT_STATE}
            onStateChange={props.onStateChange}
          />
        }
        headerExtraComponents={
          <ButtonLink variant="success" to="." search={(prev) => ({ ...prev, createCoating: true })}>
            <PlusIcon /> {COATING_CREATE_TITLE}
          </ButtonLink>
        }
        defaultState={DEFAULT_STATE}
        {...props}
      />
      <CreateEditCoatingDialog createCoating={createCoating} editCoatingId={editCoatingId} />
    </>
  );
}
