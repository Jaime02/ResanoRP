import { useDbClient } from "@tanstack/react-db";
import { FunnelIcon, PlusIcon } from "lucide-react";
import { useMemo } from "react";

import materialCollection from "@/collections/material";
import ComboboxRawMaterial from "@/components/combobox/raw-material";
import ComboboxShape from "@/components/combobox/shape";
import DialogCreateMaterial from "@/components/dialog/create-material";
import PopoverDeletedFilter from "@/components/popover/deleted-filter";
import type { PublicBaseTableProps } from "@/components/table/base-table";
import BaseTable from "@/components/table/base-table";
import { createTableColumnHelper } from "@/components/table/column-helper";
import TooltipInactiveMaterial from "@/components/tooltip/inactive-material";
import ButtonLink from "@/components/ui/button-link";
import { ModelActions } from "@/components/ui/model-actions";
import NumberInput from "@/components/ui/number-input";
import { useAppContext } from "@/contexts/app-context";
import { serializeMaterial } from "@/lib/serializers";
import { ACTIONS_LABEL, SEARCH_PLACEHOLDER, SHAPE_LABEL, SIZE_LABEL } from "@/messages/common";
import {
  MATERIAL_DELETE_MESSAGE,
  MATERIAL_DELETE_TITLE,
  MATERIAL_DELETED_MESSAGE,
  MATERIAL_RESTORE_MESSAGE,
  MATERIAL_RESTORE_TITLE,
  MATERIAL_RESTORED_MESSAGE,
  RAW_MATERIAL_LABEL,
  MATERIAL_CREATE_TITLE,
  SHOW_DELETED_MATERIALS_LABEL,
} from "@/messages/material";
import { useQueryMaterials, type TQueryMaterial } from "@/queries/material";
import type { TTableMaterialState } from "@/schemas/material";
import trpc from "@/trpc/trpc-client";
import { CellDataType } from "@/types";

interface TableMaintenanceMaterialProps extends PublicBaseTableProps<TQueryMaterial, TTableMaterialState> {
  createMaterial?: boolean;
}

const columnHelper = createTableColumnHelper<TQueryMaterial>();

export default function TableMaintenanceMaterial({ createMaterial, ...props }: TableMaintenanceMaterialProps) {
  const dbClient = useDbClient();
  const { showToastOnTransaction, showToastOnTRPCMutation } = useAppContext();

  const { data: materials, isLoading: isLoadingMaterials } = useQueryMaterials({
    filters: props.state?.filters,
    sorts: props.state?.sorts,
  });

  const columns = useMemo(
    () => [
      columnHelper.accessor((material) => material.shape?.name, {
        enableColumnFilter: true,
        header: SHAPE_LABEL,
        id: "shape",
        meta: {
          dataType: CellDataType.Combobox,
          renderFilter: ({ value, onChange }) => (
            <ComboboxShape
              testId="combobox-filter-shape"
              activeItemId={value}
              onValueChange={(shape) => onChange(shape?.id ?? null)}
              placeholder={<FunnelIcon />}
              showChevron={false}
              nullable
              triggerProps={{ variant: "secondary" }}
              className="w-fit"
            />
          ),
          filterFieldName: "shapeId",
        },
      }),
      columnHelper.accessor("width", {
        enableColumnFilter: true,
        header: SIZE_LABEL,
        meta: {
          dataType: CellDataType.Number,
          // The generic number filter emits an integer, but the width is a decimal kept as a string
          renderFilter: ({ getFilterValue, setFilterValues }) => {
            const width = getFilterValue("width");
            return (
              <NumberInput
                testId="input-filter-width"
                value={typeof width === "string" ? width : null}
                onValueChange={(value) => setFilterValues({ width: value })}
                decimalScale={1}
                placeholder={SEARCH_PLACEHOLDER}
                className="w-full"
              />
            );
          },
        },
      }),
      columnHelper.accessor((material) => material.rawMaterial?.name, {
        cell: ({ row }) => (
          <TooltipInactiveMaterial material={row.original}>{row.original.rawMaterial?.name}</TooltipInactiveMaterial>
        ),
        enableColumnFilter: true,
        header: RAW_MATERIAL_LABEL,
        id: "rawMaterial",
        meta: {
          dataType: CellDataType.Combobox,
          renderFilter: ({ value, onChange }) => (
            <ComboboxRawMaterial
              testId="combobox-filter-raw-material"
              activeItemId={value}
              onValueChange={(rawMaterial) => onChange(rawMaterial?.id ?? null)}
              placeholder={<FunnelIcon />}
              showChevron={false}
              nullable
              triggerProps={{ variant: "secondary" }}
              className="w-fit"
            />
          ),
          filterFieldName: "rawMaterialId",
        },
      }),
      columnHelper.display({
        cell: ({ row }) => (
          <ModelActions
            disabled={props.isLoading === true || isLoadingMaterials}
            {...(row.original.deletedAt === null
              ? {
                  deleteButton: {
                    dialogTitle: MATERIAL_DELETE_TITLE,
                    dialogDescription: MATERIAL_DELETE_MESSAGE,
                    serializedModel: serializeMaterial(row.original),
                    onConfirm: () =>
                      void showToastOnTransaction({
                        transaction: () =>
                          dbClient.collection(materialCollection).delete(row.original.id, {
                            optimistic: import.meta.env.VITE_ENV_NAME !== "test",
                          }),
                        onSuccess: { title: MATERIAL_DELETED_MESSAGE },
                      }),
                  },
                }
              : {
                  restoreButton: {
                    dialogTitle: MATERIAL_RESTORE_TITLE,
                    dialogDescription: MATERIAL_RESTORE_MESSAGE,
                    serializedModel: serializeMaterial(row.original),
                    onConfirm: () =>
                      void showToastOnTRPCMutation({
                        mutation: trpc.material.restore.mutate({ id: row.original.id }),
                        onSuccess: { title: MATERIAL_RESTORED_MESSAGE },
                        collection: materialCollection,
                      }),
                  },
                })}
          />
        ),
        header: ACTIONS_LABEL,
        id: "actions",
      }),
    ],
    [props.isLoading, isLoadingMaterials, dbClient, showToastOnTransaction, showToastOnTRPCMutation],
  );

  return (
    <>
      <BaseTable
        testId="table-material"
        columns={columns}
        rows={materials}
        isLoading={props.isLoading === true || isLoadingMaterials}
        customFiltersComponent={
          <PopoverDeletedFilter
            label={SHOW_DELETED_MATERIALS_LABEL}
            filters={props.state?.filters}
            tableName="table-material"
            defaultState={props.defaultState}
            onStateChange={props.onStateChange}
          />
        }
        headerExtraComponents={
          <ButtonLink variant="success" to="." search={(prev) => ({ ...prev, createMaterial: true })}>
            <PlusIcon /> {MATERIAL_CREATE_TITLE}
          </ButtonLink>
        }
        {...props}
      />
      <DialogCreateMaterial open={createMaterial === true} />
    </>
  );
}
