import { useDbClient } from "@tanstack/react-db";
import { useNavigate } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { useMemo } from "react";

import partReferenceCollection from "@/collections/part-reference";
import CreateEditPartReferenceDialog from "@/components/dialog/create-edit-part-reference";
import type { PublicBaseTableProps } from "@/components/table/base-table";
import BaseTable from "@/components/table/base-table";
import { createTableColumnHelper } from "@/components/table/column-helper";
import TooltipDeleted from "@/components/tooltip/deleted";
import ButtonLink from "@/components/ui/button-link";
import { ModelActions } from "@/components/ui/model-actions";
import { useAppContext } from "@/contexts/app-context";
import { serializePartReference } from "@/lib/serializers";
import { ACTIONS_LABEL, CLIENT_LABEL, REFERENCE_LABEL } from "@/messages/common";
import {
  CLIENT_REFERENCE_DESCRIPTION_LABEL,
  PART_REFERENCE_DELETE_MESSAGE,
  PART_REFERENCE_DELETE_TITLE,
  ADD_REFERENCE_LABEL,
  PART_REFERENCE_DELETED_MESSAGE,
  PART_REFERENCE_DELETED_TOOLTIP_MESSAGE,
  PART_REFERENCE_RESTORE_MESSAGE,
  PART_REFERENCE_RESTORE_TITLE,
  PART_REFERENCE_RESTORED_MESSAGE,
} from "@/messages/part";
import type { TPartFormPartReference } from "@/queries/part";
import type { TTablePartReferenceState } from "@/schemas/part-reference";
import trpc from "@/trpc/trpc-client";
import { TableMode } from "@/types";

const DEFAULT_STATE: TTablePartReferenceState = { sorts: [{ desc: false, id: "reference" }] };

interface PartReferencesTableProps extends PublicBaseTableProps<TPartFormPartReference, TTablePartReferenceState> {
  partReferences?: Array<TPartFormPartReference>;
  createPartReference?: boolean;
  editPartReferenceId?: number;
  editPartId?: number;
}

const columnHelper = createTableColumnHelper<TPartFormPartReference>();

export default function PartReferencesTable({
  tableMode,
  partReferences,
  createPartReference,
  editPartReferenceId,
  editPartId,
  ...props
}: PartReferencesTableProps) {
  const { showToastOnTransaction, showToastOnTRPCMutation } = useAppContext();
  const navigate = useNavigate();
  const dbClient = useDbClient();

  const editingPartReference = useMemo(() => {
    if (editPartReferenceId === undefined || !partReferences) {
      return undefined;
    }
    return partReferences.find((reference) => reference.id === editPartReferenceId && reference.deletedAt === null);
  }, [editPartReferenceId, partReferences]);

  const columns = useMemo(
    () => [
      columnHelper.accessor("reference", {
        cell: ({ row }) => (
          <div className="flex flex-row items-center gap-1">
            {row.original.reference}
            {row.original.deletedAt !== null && (
              <TooltipDeleted>{PART_REFERENCE_DELETED_TOOLTIP_MESSAGE}</TooltipDeleted>
            )}
          </div>
        ),
        header: REFERENCE_LABEL,
        id: "reference",
      }),
      columnHelper.accessor((partReference) => partReference.client?.name, {
        header: CLIENT_LABEL,
        id: "client",
      }),
      columnHelper.accessor((partReference) => partReference.clientDescription, {
        header: CLIENT_REFERENCE_DESCRIPTION_LABEL,
        id: "clientDescription",
      }),
      ...(tableMode === TableMode.Editable
        ? [
            columnHelper.display({
              cell: ({ row }) => (
                <ModelActions
                  {...(row.original.deletedAt === null
                    ? {
                        onEdit: () =>
                          void navigate({
                            search: (prev) => ({ ...prev, editPartReferenceId: row.original.id }),
                            to: ".",
                          }),
                        deleteButton: {
                          dialogTitle: PART_REFERENCE_DELETE_TITLE,
                          dialogDescription: PART_REFERENCE_DELETE_MESSAGE,
                          serializedModel: serializePartReference(row.original),
                          onConfirm: () =>
                            void showToastOnTransaction({
                              transaction: () =>
                                dbClient.collection(partReferenceCollection).delete(row.original.id, {
                                  optimistic: import.meta.env.VITE_ENV_NAME !== "test",
                                }),
                              onSuccess: {
                                title: PART_REFERENCE_DELETED_MESSAGE,
                              },
                            }),
                        },
                      }
                    : {
                        restoreButton: {
                          dialogTitle: PART_REFERENCE_RESTORE_TITLE,
                          dialogDescription: PART_REFERENCE_RESTORE_MESSAGE,
                          serializedModel: serializePartReference(row.original),
                          onConfirm: () =>
                            void showToastOnTRPCMutation({
                              mutation: trpc.partReference.restore.mutate({ id: row.original.id }),
                              onSuccess: { title: PART_REFERENCE_RESTORED_MESSAGE },
                              collection: partReferenceCollection,
                            }),
                        },
                      })}
                />
              ),
              header: ACTIONS_LABEL,
              id: "actions",
            }),
          ]
        : []),
    ],
    [tableMode, navigate, dbClient, showToastOnTransaction, showToastOnTRPCMutation],
  );

  return (
    <>
      <BaseTable
        testId="table-part-references"
        columns={columns}
        rows={partReferences}
        defaultState={DEFAULT_STATE}
        headerExtraComponents={
          tableMode === TableMode.Editable ? (
            <ButtonLink
              testId="button-add-reference"
              variant="success"
              to="."
              search={(prev) => ({ ...prev, createPartReference: true })}
            >
              <PlusIcon /> {ADD_REFERENCE_LABEL}
            </ButtonLink>
          ) : undefined
        }
        {...props}
      />
      <CreateEditPartReferenceDialog
        createPartReference={createPartReference}
        editingPartReference={editingPartReference}
        editingPartId={editPartId}
      />
    </>
  );
}
