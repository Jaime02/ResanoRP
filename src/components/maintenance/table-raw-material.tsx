import { useDbClient } from "@tanstack/react-db";
import { useNavigate } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { useMemo } from "react";

import rawMaterialCollection from "@/collections/raw-material";
import CreateEditRawMaterialDialog from "@/components/dialog/create-edit-raw-material";
import PopoverDeletedFilter from "@/components/popover/deleted-filter";
import type { PublicBaseTableProps } from "@/components/table/base-table";
import BaseTable from "@/components/table/base-table";
import { createTableColumnHelper } from "@/components/table/column-helper";
import ButtonLink from "@/components/ui/button-link";
import { ModelActions } from "@/components/ui/model-actions";
import { useAppContext } from "@/contexts/app-context";
import type { TRawMaterialForm } from "@/form/hooks/use-raw-material";
import { formatPricePerKilo } from "@/lib/formatters";
import { serializeRawMaterial } from "@/lib/serializers";
import { ACTIONS_LABEL, NAME_LABEL } from "@/messages/common";
import {
  RAW_MATERIAL_DELETE_MESSAGE,
  RAW_MATERIAL_DELETE_TITLE,
  RAW_MATERIAL_DELETED_MESSAGE,
  RAW_MATERIAL_PRICE_LABEL,
  RAW_MATERIAL_RESTORE_MESSAGE,
  RAW_MATERIAL_RESTORE_TITLE,
  RAW_MATERIAL_RESTORED_MESSAGE,
  RAW_MATERIAL_DENSITY_LABEL,
  RAW_MATERIAL_CREATE_TITLE,
  SHOW_DELETED_RAW_MATERIALS_LABEL,
} from "@/messages/material";
import { useQueryRawMaterials } from "@/queries/raw-material";
import type { TTableRawMaterialState } from "@/schemas/delivery-note-line";
import trpc from "@/trpc/trpc-client";
import { CellDataType } from "@/types";

const DEFAULT_STATE: TTableRawMaterialState = { sorts: [{ desc: false, id: "name" }] };

interface TableMaintenanceRawMaterialProps extends PublicBaseTableProps<TRawMaterialForm, TTableRawMaterialState> {
  editRawMaterialId?: number;
  createRawMaterial?: boolean;
}

const columnHelper = createTableColumnHelper<TRawMaterialForm>();

export default function TableMaintenanceRawMaterial({
  editRawMaterialId,
  createRawMaterial,
  ...props
}: TableMaintenanceRawMaterialProps) {
  const navigate = useNavigate();
  const dbClient = useDbClient();
  const { showToastOnTransaction, showToastOnTRPCMutation } = useAppContext();

  const { data: rawMaterials, isLoading: isLoadingRawMaterials } = useQueryRawMaterials({
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
      columnHelper.accessor("price", {
        cell: ({ row }) => formatPricePerKilo(row.original.price),
        enableColumnFilter: true,
        header: RAW_MATERIAL_PRICE_LABEL,
        id: "price",
        meta: { dataType: CellDataType.Price },
      }),
      columnHelper.accessor("density", {
        cell: ({ row }) => (row.original.density !== null ? `${row.original.density} g/cm³` : ""),
        header: RAW_MATERIAL_DENSITY_LABEL,
        id: "density",
      }),
      columnHelper.display({
        cell: ({ row }) => (
          <ModelActions
            disabled={props.isLoading === true || isLoadingRawMaterials}
            {...(row.original.deletedAt === null
              ? {
                  onEdit: () =>
                    void navigate({
                      search: (prev) => ({ ...prev, editRawMaterialId: row.original.id }),
                      to: ".",
                    }),
                  deleteButton: {
                    dialogTitle: RAW_MATERIAL_DELETE_TITLE,
                    dialogDescription: RAW_MATERIAL_DELETE_MESSAGE,
                    serializedModel: serializeRawMaterial(row.original),
                    onConfirm: () =>
                      void showToastOnTransaction({
                        transaction: () =>
                          dbClient.collection(rawMaterialCollection).delete(row.original.id, {
                            optimistic: import.meta.env.VITE_ENV_NAME !== "test",
                          }),
                        onSuccess: { title: RAW_MATERIAL_DELETED_MESSAGE },
                      }),
                  },
                }
              : {
                  restoreButton: {
                    dialogTitle: RAW_MATERIAL_RESTORE_TITLE,
                    dialogDescription: RAW_MATERIAL_RESTORE_MESSAGE,
                    serializedModel: serializeRawMaterial(row.original),
                    onConfirm: () =>
                      void showToastOnTRPCMutation({
                        mutation: trpc.rawMaterial.restore.mutate({ id: row.original.id }),
                        onSuccess: { title: RAW_MATERIAL_RESTORED_MESSAGE },
                      }),
                  },
                })}
          />
        ),
        header: ACTIONS_LABEL,
        id: "actions",
      }),
    ],
    [props.isLoading, isLoadingRawMaterials, navigate, dbClient, showToastOnTransaction, showToastOnTRPCMutation],
  );

  return (
    <>
      <BaseTable
        testId="table-raw-material"
        columns={columns}
        rows={rawMaterials}
        isLoading={props.isLoading === true || isLoadingRawMaterials}
        customFiltersComponent={
          <PopoverDeletedFilter
            label={SHOW_DELETED_RAW_MATERIALS_LABEL}
            filters={props.state?.filters}
            tableName="table-raw-material"
            defaultState={props.defaultState ?? DEFAULT_STATE}
            onStateChange={props.onStateChange}
          />
        }
        headerExtraComponents={
          <ButtonLink variant="success" to="." search={(prev) => ({ ...prev, createRawMaterial: true })}>
            <PlusIcon /> {RAW_MATERIAL_CREATE_TITLE}
          </ButtonLink>
        }
        defaultState={DEFAULT_STATE}
        {...props}
      />
      <CreateEditRawMaterialDialog createRawMaterial={createRawMaterial} editRawMaterialId={editRawMaterialId} />
    </>
  );
}
