import { useDbClient } from "@tanstack/react-db";
import { useNavigate } from "@tanstack/react-router";
import { FunnelIcon, PlusIcon } from "lucide-react";
import { useCallback, useMemo } from "react";

import partCollection from "@/collections/part";
import ComboboxCoating from "@/components/combobox/coating";
import DialogBlueprintViewer from "@/components/dialog/blueprint-viewer";
import DialogPartStock from "@/components/dialog/part-stock";
import ShapeIcon from "@/components/icons/shape";
import PopoverPartFilters from "@/components/popover/part-filters";
import PopoverPartMaterialFilters from "@/components/popover/part-material-filters";
import type { PublicBaseTableProps } from "@/components/table/base-table";
import BaseTable from "@/components/table/base-table";
import CellVerticalList from "@/components/table/cell-vertical-list";
import { DEFAULT_DESCRIPTION_COLUMN_SIZE, createTableColumnHelper } from "@/components/table/column-helper";
import TooltipInactiveMaterial from "@/components/tooltip/inactive-material";
import ButtonLink from "@/components/ui/button-link";
import { InfoPopoverTrigger } from "@/components/ui/info-popover";
import { ModelActions } from "@/components/ui/model-actions";
import { Popover, PopoverContent } from "@/components/ui/popover";
import { useAppContext } from "@/contexts/app-context";
import { formatMaterial } from "@/lib/formatters";
import { serializePart } from "@/lib/serializers";
import { ACTIONS_LABEL, COATING_LABEL, DESCRIPTION_LABEL } from "@/messages/common";
import { MATERIALS_LABEL } from "@/messages/material";
import {
  PART_DELETE_MESSAGE,
  PART_DELETE_TITLE,
  PART_DELETED_MESSAGE,
  PART_RESTORE_MESSAGE,
  PART_RESTORE_TITLE,
  PART_REFERENCES_TITLE,
  PART_RESTORED_MESSAGE,
  PART_CREATE_TITLE,
  STOCK_LABEL,
} from "@/messages/part";
import { DEFAULT_PART_SORTING, useQueryPartTable, type TPartForm } from "@/queries/part";
import { PART_POPOVER_FILTER_IDS, type TTablePartState } from "@/schemas/part";
import trpc from "@/trpc/trpc-client";
import { CellDataType, TableMode, TablePartPickerMode } from "@/types";

export type TPartTableOnRowSelectParams = {
  partId: number;
  activeItemId: number;
  formattedActiveItem: string;
  description: string;
} & (
  | {
      pickerMode: TablePartPickerMode.PickParts;
      partReferenceId?: never;
      clientDescription?: never;
    }
  | {
      pickerMode: TablePartPickerMode.PickReferences;
      partReferenceId: number;
      clientDescription: string;
    }
);

interface TablePartProps extends PublicBaseTableProps<TPartForm, TTablePartState> {
  currentClientId?: number | null;
  onRowSelect?: (params: TPartTableOnRowSelectParams) => void;
  pickerMode?: TablePartPickerMode;
}

const DEFAULT_STATE: TTablePartState = { sorts: DEFAULT_PART_SORTING };

const columnHelper = createTableColumnHelper<TPartForm>();

export default function TablePart({
  testId = "table-part",
  state,
  tableMode,
  currentClientId,
  onRowSelect,
  pickerMode,
  ...props
}: TablePartProps) {
  const { showToastOnTransaction, showToastOnTRPCMutation } = useAppContext();
  const navigate = useNavigate();
  const dbClient = useDbClient();

  const handleEdit = useCallback(
    async (partId: number) => {
      await navigate({
        params: { id: partId },
        to: "/part/$id",
      });
    },
    [navigate],
  );

  const baseFilters = state?.filters ?? props.defaultState?.filters;

  const filters = useMemo(() => {
    if (currentClientId == null) return baseFilters;
    return [
      ...(baseFilters?.filter((filter) => filter.id !== "clientId") ?? []),
      { id: "clientId" as const, value: currentClientId },
    ];
  }, [baseFilters, currentClientId]);

  // The clientId filter is forced by currentClientId, so it cannot be changed, and deleted Artículos cannot be picked
  const popoverFilterIds = PART_POPOVER_FILTER_IDS.filter((filterId) =>
    filterId === "clientId" ? currentClientId == null : tableMode === TableMode.Editable,
  );

  const {
    data: parts,
    rowCount,
    isLoading: isLoadingParts,
  } = useQueryPartTable({
    filters,
    pagination: state?.pagination ?? props.defaultState?.pagination,
    sorts: state?.sorts ?? props.defaultState?.sorts,
  });

  const columns = useMemo(
    () => [
      columnHelper.accessor((part) => part.references, {
        cell: ({ row }) => (
          <CellVerticalList>
            {row.original.references.map((partReference, i) => (
              <div
                className="flex flex-row items-center justify-start gap-1"
                key={i}
                data-testid="div-part-reference-row"
              >
                {tableMode === TableMode.Picker &&
                  pickerMode === TablePartPickerMode.PickReferences &&
                  (partReference.client == undefined || partReference.client.id === currentClientId) && (
                    <ModelActions
                      onSuccess={() =>
                        onRowSelect?.({
                          activeItemId: row.original.id,
                          clientDescription: partReference.clientDescription,
                          description: row.original.description,
                          formattedActiveItem: partReference.reference,
                          partId: row.original.id,
                          partReferenceId: partReference.id,
                          pickerMode: TablePartPickerMode.PickReferences,
                        })
                      }
                    />
                  )}
                {partReference.clientDescription && partReference.clientDescription !== row.original.description ? (
                  <Popover>
                    <InfoPopoverTrigger>
                      {partReference.reference} {partReference.client && ` | ${partReference.client.name}`}
                    </InfoPopoverTrigger>
                    <PopoverContent>{partReference.clientDescription}</PopoverContent>
                  </Popover>
                ) : (
                  <span>
                    {partReference.reference} {partReference.client && ` | ${partReference.client.name}`}
                  </span>
                )}
              </div>
            ))}
          </CellVerticalList>
        ),
        enableResizing: true,
        enableColumnFilter: true,
        header: PART_REFERENCES_TITLE,
        id: "reference",
        size: 300,
        meta: { dataType: CellDataType.String },
      }),
      columnHelper.accessor("description", {
        enableColumnFilter: true,
        enableResizing: true,
        header: DESCRIPTION_LABEL,
        id: "description",
        size: DEFAULT_DESCRIPTION_COLUMN_SIZE,
        meta: {
          dataType: CellDataType.String,
        },
      }),
      columnHelper.accessor((part) => part.materials, {
        cell: ({ row }) => (
          <CellVerticalList>
            {row.original.materials.map((material) => (
              <TooltipInactiveMaterial key={material.id} material={material}>
                <span className="inline-flex items-center gap-1">
                  <ShapeIcon shapeName={material.shape.name} />
                  {formatMaterial({
                    rawMaterialName: material.rawMaterial.name,
                    width: material.width,
                  })}
                </span>
              </TooltipInactiveMaterial>
            ))}
          </CellVerticalList>
        ),
        enableColumnFilter: true,
        header: MATERIALS_LABEL,
        id: "materials",
        size: 200,
        meta: {
          dataType: CellDataType.String,
          renderFilter: ({ getFilterValue, setFilterValues }) => (
            <PopoverPartMaterialFilters getFilterValue={getFilterValue} setFilterValues={setFilterValues} />
          ),
        },
      }),
      columnHelper.accessor((part) => part.coating?.name, {
        enableColumnFilter: true,
        header: COATING_LABEL,
        id: "coating",
        meta: {
          dataType: CellDataType.Combobox,
          renderFilter: ({ value, onChange }) => (
            <ComboboxCoating
              testId="combobox-filter-coating"
              activeItemId={value}
              onValueChange={(coating) => onChange(coating?.id ?? null)}
              placeholder={<FunnelIcon />}
              showChevron={false}
              nullable
              triggerProps={{ variant: "secondary" }}
              className="w-fit"
            />
          ),
          filterFieldName: "coatingId",
        },
        size: 220,
      }),
      columnHelper.accessor((part) => part.stockTransactions.at(0)?.finalQuantity, {
        header: STOCK_LABEL,
        id: "partStockQuantity",
        meta: { dataType: CellDataType.Number },
      }),
      columnHelper.display({
        size: 190,
        cell: ({ row }) => (
          <ModelActions
            {...(tableMode === TableMode.Editable
              ? {
                  ...(row.original.deletedAt === null
                    ? {
                        deleteButton: {
                          dialogTitle: PART_DELETE_TITLE,
                          dialogDescription: PART_DELETE_MESSAGE,
                          serializedModel: serializePart(row.original),
                          onConfirm: async () =>
                            void showToastOnTransaction({
                              transaction: () =>
                                dbClient.collection(partCollection).delete(row.original.id, {
                                  optimistic: import.meta.env.VITE_ENV_NAME !== "test",
                                }),
                              onSuccess: {
                                title: PART_DELETED_MESSAGE,
                              },
                            }),
                        },
                      }
                    : {
                        restoreButton: {
                          dialogTitle: PART_RESTORE_TITLE,
                          dialogDescription: PART_RESTORE_MESSAGE,
                          serializedModel: serializePart(row.original),
                          onConfirm: () =>
                            void showToastOnTRPCMutation({
                              mutation: trpc.part.restore.mutate({ id: row.original.id }),
                              onSuccess: { title: PART_RESTORED_MESSAGE },
                              collection: partCollection,
                            }),
                        },
                      }),
                  onEdit: async () => handleEdit(row.original.id),
                }
              : {})}
            {...(tableMode === TableMode.Picker && pickerMode === TablePartPickerMode.PickParts
              ? {
                  onSuccess: () =>
                    onRowSelect?.({
                      activeItemId: row.original.id,
                      description: row.original.description,
                      formattedActiveItem: row.original.description,
                      partId: row.original.id,
                      pickerMode: TablePartPickerMode.PickParts,
                    }),
                }
              : {})}
            extraComponentsStart={
              <>
                <DialogPartStock part={row.original} partStockTransactions={row.original.stockTransactions} />
                <DialogBlueprintViewer
                  title={`Planos del Artículo "${row.original.description}"`}
                  blueprints={row.original.blueprints}
                />
              </>
            }
          />
        ),
        header: ACTIONS_LABEL,
        id: "actions",
      }),
    ],
    [
      tableMode,
      currentClientId,
      onRowSelect,
      pickerMode,
      handleEdit,
      dbClient,
      showToastOnTransaction,
      showToastOnTRPCMutation,
    ],
  );

  return (
    <BaseTable
      defaultState={DEFAULT_STATE}
      testId={testId}
      state={state}
      tableMode={tableMode}
      columns={columns}
      rows={parts}
      rowCount={rowCount}
      isLoading={props.isLoading === true || isLoadingParts}
      customFiltersComponent={
        <PopoverPartFilters
          filterIds={popoverFilterIds}
          filters={filters}
          tableName={testId}
          defaultState={props.defaultState ?? DEFAULT_STATE}
          onStateChange={props.onStateChange}
        />
      }
      headerExtraComponents={
        tableMode === TableMode.Editable ? (
          <ButtonLink variant="success" to="." search={(prev) => ({ ...prev, createPart: true })}>
            <PlusIcon /> {PART_CREATE_TITLE}
          </ButtonLink>
        ) : undefined
      }
      title={({ rowCount }) => <>{rowCount} Artículos</>}
      {...props}
    />
  );
}
