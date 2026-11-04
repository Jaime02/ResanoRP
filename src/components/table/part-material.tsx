import { useDbClient } from "@tanstack/react-db";
import { FunnelIcon, XIcon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import partMaterialCollection, { getPartMaterialKey } from "@/collections/part-material";
import ComboboxRawMaterial from "@/components/combobox/raw-material";
import BaseTable from "@/components/table/base-table";
import ButtonDeleteModel from "@/components/table/button-delete-model";
import { createTableColumnHelper } from "@/components/table/column-helper";
import TooltipInactiveMaterial from "@/components/tooltip/inactive-material";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ModelActions } from "@/components/ui/model-actions";
import { Separator } from "@/components/ui/separator";
import { useAppContext } from "@/contexts/app-context";
import { serializeMaterial } from "@/lib/serializers";
import { ACTIONS_LABEL, DELETE_FILTERS_LABEL, MATERIAL_LABEL, SHAPE_LABEL, SIZE_LABEL } from "@/messages/common";
import { MATERIAL_DELETE_TITLE, MATERIAL_DELETED_MESSAGE, MATERIALS_LABEL } from "@/messages/material";
import {
  NO_COMPATIBLE_MATERIALS_MESSAGE,
  PART_ADD_MATERIAL_TITLE,
  PART_MATERIAL_ASSIGNED_MESSAGE,
  PART_MATERIAL_DELETE_MESSAGE,
  PART_NO_MATERIALS_MESSAGE,
  PART_SELECT_SHAPE_AND_SIZE_MESSAGE,
} from "@/messages/part";
import type { TPartForm } from "@/queries/part";
import type { TCompatiblePartMaterial } from "@/queries/part-material";
import { useQueryCompatiblePartMaterials } from "@/queries/part-material";
import type { TTableState } from "@/schemas";
import { TableMode } from "@/types";
import { COMPATIBLE_MATERIALS_PAGE_SIZE } from "@/types/material";

interface PartMaterialsTableProps {
  tableMode: TableMode;
  className?: string;
  part?: TPartForm;
  width?: string | null;
  shapeId?: number | null;
  skipQueries?: boolean;
}

const COMPATIBLE_MATERIALS_INITIAL_STATE: TTableState = { pagination: { pageSize: COMPATIBLE_MATERIALS_PAGE_SIZE } };

const partMaterialColumnHelper = createTableColumnHelper<TPartForm["materials"][number]>();
const compatibleMaterialColumnHelper = createTableColumnHelper<TCompatiblePartMaterial>();

export default function PartMaterialsTable({
  tableMode,
  className,
  part,
  width,
  shapeId,
  skipQueries = false,
}: PartMaterialsTableProps) {
  const dbClient = useDbClient();
  const { showToastOnTransaction } = useAppContext();

  const [selectedRawMaterialId, setSelectedRawMaterialId] = useState<number | undefined>(undefined);
  const [compatibleMaterialsState, setCompatibleMaterialsState] = useState<TTableState | undefined>(
    COMPATIBLE_MATERIALS_INITIAL_STATE,
  );

  const isEditable = tableMode === TableMode.Editable;

  const { data: compatibleMaterials, isLoading: isLoadingCompatibleMaterials } = useQueryCompatiblePartMaterials({
    shapeId,
    width,
    selectedRawMaterialId,
    partId: part?.id,
    skip: skipQueries,
  });

  const setSelectedRawMaterial = useCallback((rawMaterialId: number | undefined) => {
    setSelectedRawMaterialId(rawMaterialId);
    setCompatibleMaterialsState(COMPATIBLE_MATERIALS_INITIAL_STATE);
  }, []);

  const partMaterialsColumns = useMemo(
    () => [
      partMaterialColumnHelper.display({
        cell: ({ row }) => (
          <TooltipInactiveMaterial material={row.original}>{row.original.rawMaterial.name}</TooltipInactiveMaterial>
        ),
        header: MATERIAL_LABEL,
        id: "rawMaterial",
        meta: { cellClassName: "font-medium" },
      }),
      partMaterialColumnHelper.display({
        cell: ({ row }) => row.original.shape.name,
        header: SHAPE_LABEL,
        id: "shape",
      }),
      partMaterialColumnHelper.display({
        cell: ({ row }) => `${row.original.width} mm`,
        header: SIZE_LABEL,
        id: "width",
      }),
      ...(isEditable
        ? [
            partMaterialColumnHelper.display({
              cell: ({ row }) => (
                <ButtonDeleteModel
                  dialogTitle={MATERIAL_DELETE_TITLE}
                  dialogDescription={PART_MATERIAL_DELETE_MESSAGE}
                  serializedModel={serializeMaterial(row.original)}
                  onConfirm={() => {
                    if (part) {
                      void showToastOnTransaction({
                        transaction: () =>
                          dbClient
                            .collection(partMaterialCollection)
                            .delete(getPartMaterialKey({ partId: part.id, materialId: row.original.id }), {
                              optimistic: import.meta.env.VITE_ENV_NAME !== "test",
                            }),
                        onSuccess: {
                          title: MATERIAL_DELETED_MESSAGE,
                        },
                      });
                    }
                  }}
                />
              ),
              header: ACTIONS_LABEL,
              id: "actions",
              meta: { cellClassName: "text-center" },
            }),
          ]
        : []),
    ],
    [isEditable, part, dbClient, showToastOnTransaction],
  );

  const compatibleMaterialsColumns = useMemo(
    () => [
      compatibleMaterialColumnHelper.display({
        cell: ({ row }) => row.original.rawMaterial?.name,
        header: () => (
          <div className="flex flex-row items-center gap-2">
            {MATERIAL_LABEL}
            <ComboboxRawMaterial
              testId="combobox-raw-material"
              activeItemId={selectedRawMaterialId}
              onValueChange={(value) => {
                setSelectedRawMaterial(value?.id);
              }}
              className="w-fit"
              placeholder={<FunnelIcon />}
            />
          </div>
        ),
        id: "rawMaterial",
      }),
      compatibleMaterialColumnHelper.display({
        cell: ({ row }) => row.original.shape?.name,
        header: SHAPE_LABEL,
        id: "shape",
      }),
      compatibleMaterialColumnHelper.display({
        cell: ({ row }) => `${row.original.width} mm`,
        header: SIZE_LABEL,
        id: "width",
      }),
      compatibleMaterialColumnHelper.display({
        cell: ({ row }) => (
          <ModelActions
            onSuccess={() => {
              if (part) {
                void showToastOnTransaction({
                  transaction: () =>
                    dbClient.collection(partMaterialCollection).insert(
                      {
                        materialId: row.original.id,
                        partId: part.id,
                      },
                      { optimistic: import.meta.env.VITE_ENV_NAME !== "test" },
                    ),
                  onSuccess: {
                    title: PART_MATERIAL_ASSIGNED_MESSAGE,
                  },
                });
              }
            }}
          />
        ),
        header: ACTIONS_LABEL,
        id: "actions",
        meta: { cellClassName: "text-center" },
      }),
    ],
    [selectedRawMaterialId, setSelectedRawMaterial, part, dbClient, showToastOnTransaction],
  );

  return (
    <Card className={className}>
      <BaseTable
        testId="table-part-materials"
        title={MATERIALS_LABEL}
        className="self-center"
        columns={partMaterialsColumns}
        rows={part?.materials}
        isLoading={part === undefined || isLoadingCompatibleMaterials || skipQueries}
        skeletonRowsCount={1}
        noDataMessage={PART_NO_MATERIALS_MESSAGE}
        state={{ pagination: null }}
      />
      {isEditable && (
        <>
          <Separator className="my-2" />
          <BaseTable
            testId="table-compatible-part-materials"
            title={PART_ADD_MATERIAL_TITLE}
            columns={compatibleMaterialsColumns}
            rows={compatibleMaterials}
            isLoading={isLoadingCompatibleMaterials || compatibleMaterials === undefined}
            noDataMessage={
              width == null || shapeId == null ? PART_SELECT_SHAPE_AND_SIZE_MESSAGE : NO_COMPATIBLE_MATERIALS_MESSAGE
            }
            state={compatibleMaterialsState}
            onStateChange={setCompatibleMaterialsState}
            headerExtraComponents={
              selectedRawMaterialId !== undefined ? (
                <Button
                  variant="destructive"
                  onClick={() => {
                    setSelectedRawMaterial(undefined);
                  }}
                >
                  {DELETE_FILTERS_LABEL}
                  <XIcon />
                </Button>
              ) : undefined
            }
          />
        </>
      )}
    </Card>
  );
}
