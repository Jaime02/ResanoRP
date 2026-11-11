import { useDbClient } from "@tanstack/react-db";
import { useNavigate } from "@tanstack/react-router";
import type { Row } from "@tanstack/react-table";
import { FunnelIcon, ListIcon, ListOrderedIcon, PlusIcon, XIcon } from "lucide-react";
import { useCallback, useMemo } from "react";

import machineProductionOrderQueueCollection from "@/collections/machine-production-order-queue";
import productionOrderCollection from "@/collections/production-order";
import ComboboxMachine from "@/components/combobox/machine";
import DialogBlueprintViewer from "@/components/dialog/blueprint-viewer";
import CogWorking from "@/components/icons/cog-working";
import ShapeIcon from "@/components/icons/shape";
import PopoverPartMaterialFilters from "@/components/popover/part-material-filters";
import type { PublicBaseTableProps, TBaseTableFeatures } from "@/components/table/base-table";
import BaseTable from "@/components/table/base-table";
import {
  DEFAULT_DESCRIPTION_COLUMN_SIZE,
  DEFAULT_MACHINE_COLUMN_SIZE,
  createTableColumnHelper,
} from "@/components/table/column-helper";
import TooltipPartReferences from "@/components/tooltip/part-references";
import TooltipProductionOrderStatus from "@/components/tooltip/production-order-status";
import { Button } from "@/components/ui/button";
import { ButtonCopyLayout } from "@/components/ui/button-copy";
import ButtonLink from "@/components/ui/button-link";
import { ModelActions } from "@/components/ui/model-actions";
import { TableCell, TableRow } from "@/components/ui/table";
import { useAppContext } from "@/contexts/app-context";
import FormProductionOrder from "@/form/forms/production-order";
import { formatDate, formatPartDimension } from "@/lib/formatters";
import { getProductionOrderPendingQuantity, isProductionFinished } from "@/lib/production-order";
import { serializeProductionOrder } from "@/lib/serializers";
import { useTableStateSearch } from "@/lib/use-table-state-search";
import { BLUEPRINTS_OF_PART_TITLE } from "@/messages/blueprint";
import {
  ACTIONS_LABEL,
  CLIENT_LABEL,
  DESCRIPTION_LABEL,
  MACHINE_LABEL,
  PAGINATE_LABEL,
  PART_LABEL,
  PENDING_LABEL,
  REFERENCE_LABEL,
  SHOW_ALL_LABEL,
  SIZE_LABEL,
  STATUS_LABEL,
} from "@/messages/common";
import {
  ASSIGN_LABEL,
  MACHINE_ASSIGNED_MESSAGE,
  MACHINE_UNASSIGNED_MESSAGE,
  PRODUCTION_ORDER_DELETE_MESSAGE,
  PRODUCTION_ORDER_DELETE_TITLE,
  PRODUCTION_ORDER_DELETED_MESSAGE,
  PRODUCTION_ORDER_RESTORE_MESSAGE,
  PRODUCTION_ORDER_RESTORE_TITLE,
  PRODUCTION_ORDER_CREATE_TITLE,
  PRODUCTION_ORDER_RESTORED_MESSAGE,
} from "@/messages/production-order";
import { DELIVERY_LABEL } from "@/messages/sell-order";
import type { TProductionOrderTableRow } from "@/queries/production-order";
import {
  DEFAULT_PRODUCTION_ORDER_SORTING,
  getProductionOrderStatus,
  useQueryProductionOrderTable,
} from "@/queries/production-order";
import type { TTableState } from "@/schemas";
import type { TProductionOrderFilters, TTableProductionOrderState } from "@/schemas/production-order";
import { ProductionOrderStatus } from "@/schemas/production-order";
import trpc from "@/trpc/trpc-client";
import { CellDataType, FormMode, TableMode } from "@/types";

interface TableProductionOrderProps extends PublicBaseTableProps<TProductionOrderTableRow, TTableProductionOrderState> {
  tableMode: TableMode;
}

const DEFAULT_STATE: TTableProductionOrderState = { sorts: DEFAULT_PRODUCTION_ORDER_SORTING };

// The Medida column shows the width and the shape of the Artículo, not the ones of its Materiales
const DIMENSION_FILTER_IDS = {
  width: "partWidth",
  rawMaterialId: "materialRawMaterialId",
  shapeId: "partShapeId",
} satisfies Record<string, TProductionOrderFilters[number]["id"]>;

const columnHelper = createTableColumnHelper<TProductionOrderTableRow>();

export default function TableProductionOrder({
  tableMode,
  state,
  testId = "table-production-order",
  ...props
}: TableProductionOrderProps) {
  const { isAdmin, showToastOnTransaction, showToastOnTRPCMutation } = useAppContext();
  const navigate = useNavigate();
  const dbClient = useDbClient();
  const navigateOnStateSearch = useTableStateSearch<TTableState>(testId, props.defaultState);
  const navigateOnStateChange = props.onStateChange ?? navigateOnStateSearch;

  const handleOpenEditDialog = useCallback(
    async (productionOrderId: number) => {
      await navigate({
        params: { id: productionOrderId },
        to: "/production-order/$id",
      });
    },
    [navigate],
  );

  const {
    data: productionOrders,
    rowCount,
    isLoading: isLoadingProductionOrders,
  } = useQueryProductionOrderTable({
    filters: state?.filters ?? props.defaultState?.filters,
    pagination: state?.pagination !== undefined ? state.pagination : props.defaultState?.pagination,
    sorts: state?.sorts ?? props.defaultState?.sorts,
  });

  const columns = useMemo(
    () => [
      columnHelper.accessor((row) => getProductionOrderStatus(row), {
        cell: ({ cell }) => <TooltipProductionOrderStatus status={cell.getValue()} />,
        enableColumnFilter: true,
        header: STATUS_LABEL,
        id: "status",
        size: 180,
        meta: { dataType: CellDataType.Enum, enumName: "ProductionOrderStatus", filterFieldName: "statuses" },
      }),
      columnHelper.accessor((productionOrder) => productionOrder.part?.references, {
        cell: ({ row }) => (
          <ButtonCopyLayout value={row.original.sellOrderLine?.partReference?.reference}>
            {!row.original.sellOrderLine && <TooltipPartReferences references={row.original.part?.references ?? []} />}
            <ButtonLink
              to="/part/$id"
              params={{ id: String(row.original.part?.id) }}
              disabled={row.original.part?.id === undefined}
              target="_blank"
            >
              {row.original.sellOrderLine?.partReference?.reference ?? PART_LABEL}
            </ButtonLink>
          </ButtonCopyLayout>
        ),
        size: 280,
        enableColumnFilter: true,
        header: REFERENCE_LABEL,
        id: "partReference",
        meta: { dataType: CellDataType.String },
      }),
      columnHelper.accessor((productionOrder) => productionOrder.part?.description, {
        enableColumnFilter: true,
        enableResizing: true,
        header: DESCRIPTION_LABEL,
        meta: { dataType: CellDataType.String, filterFieldName: "partDescription" },
        size: DEFAULT_DESCRIPTION_COLUMN_SIZE,
      }),
      columnHelper.accessor((row) => row.sellOrderLine?.sellOrder?.client?.name ?? "", {
        enableColumnFilter: true,
        enableResizing: true,
        header: CLIENT_LABEL,
        id: "clientName",
        meta: { dataType: CellDataType.String, filterFieldName: "clientName" },
        size: 200,
      }),
      columnHelper.accessor((row) => formatPartDimension(row.part), {
        cell: (info) => (
          <span className="inline-flex items-center gap-1">
            <ShapeIcon shapeName={info.row.original.part?.shape?.name} />
            {info.getValue()}
          </span>
        ),
        enableColumnFilter: true,
        enableSorting: true,
        header: SIZE_LABEL,
        id: "dimension",
        meta: {
          dataType: CellDataType.String,
          renderFilter: ({ getFilterValue, setFilterValues }) => (
            <PopoverPartMaterialFilters
              getFilterValue={getFilterValue}
              setFilterValues={setFilterValues}
              filterIds={DIMENSION_FILTER_IDS}
            />
          ),
        },
      }),
      columnHelper.accessor((row) => getProductionOrderPendingQuantity(row.quantity, row.producedQuantity), {
        header: PENDING_LABEL,
        id: "pendingQuantity",
        meta: { dataType: CellDataType.Number },
      }),
      columnHelper.accessor((row) => row.sellOrderLine?.requestedDeliveryDate ?? "", {
        cell: (info) => formatDate(info.getValue()),
        enableSorting: true,
        header: DELIVERY_LABEL,
        id: "requestedDeliveryDate",
        meta: { dataType: CellDataType.Date, filterFieldName: "requestedDeliveryDate" },
      }),
      columnHelper.accessor("assignedMachines", {
        cell: ({ row }) => {
          const status = getProductionOrderStatus(row.original);
          return (
            <div className="flex flex-row gap-2">
              {isProductionFinished(status) ? (
                <div className="flex w-full flex-col gap-1">
                  {[...new Map(row.original.producedMachines.map((machine) => [machine.id, machine])).values()].map(
                    (machine) => (
                      <Button key={machine.id} disabled clickable={false}>
                        {machine.name}
                      </Button>
                    ),
                  )}
                </div>
              ) : (
                <>
                  {tableMode === TableMode.Editable &&
                    [ProductionOrderStatus.Pending, ProductionOrderStatus.InProduction].includes(status) && (
                      <ComboboxMachine
                        testId="combobox-assign-machine"
                        onValueChange={(machine) => {
                          if (!machine) {
                            return;
                          }
                          void showToastOnTransaction({
                            transaction: () =>
                              dbClient.collection(machineProductionOrderQueueCollection).insert(
                                {
                                  machineId: machine.id,
                                  productionOrderId: row.original.id,
                                  timestamp: new Date(),
                                },
                                { optimistic: import.meta.env.VITE_ENV_NAME !== "test" },
                              ),
                            onSuccess: {
                              title: MACHINE_ASSIGNED_MESSAGE,
                            },
                          });
                        }}
                        excludeItemIds={row.original.assignedMachines.map((machine) => machine.id)}
                        partWidth={row.original.part?.width ?? null}
                        placeholder={row.original.assignedMachines.length === 0 ? ASSIGN_LABEL : ""}
                        className={row.original.assignedMachines.length === 0 ? "w-full" : "w-auto"}
                        triggerProps={{
                          size: row.original.assignedMachines.length === 0 ? undefined : "icon",
                          variant: "success",
                        }}
                        take={50}
                      />
                    )}
                  {row.original.assignedMachines.length > 0 && (
                    <div className="flex w-full flex-col gap-1">
                      {row.original.assignedMachines.map((machine, index) => (
                        <div
                          key={index}
                          data-testid={`div-assigned-machine-${machine.id}`}
                          className="flex flex-row gap-1"
                        >
                          <Button className="grow" disabled clickable={false}>
                            {machine.activeProductionOrderId === row.original.id && <CogWorking />}
                            {machine.name}
                          </Button>
                          {tableMode === TableMode.Editable &&
                            [ProductionOrderStatus.Pending, ProductionOrderStatus.InProduction].includes(status) &&
                            machine.activeProductionOrderId !== row.original.id && (
                              <Button
                                testId="button-unassign-machine"
                                variant="destructive"
                                size="icon"
                                onClick={async () => {
                                  void showToastOnTRPCMutation({
                                    mutation: trpc.machineProductionOrderQueue.delete.mutate({
                                      machineId: machine.id,
                                      productionOrderId: row.original.id,
                                    }),
                                    onSuccess: {
                                      title: MACHINE_UNASSIGNED_MESSAGE,
                                    },
                                  });
                                }}
                              >
                                <XIcon />
                              </Button>
                            )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        },
        header: MACHINE_LABEL,
        id: "machineId",
        enableColumnFilter: true,
        size: DEFAULT_MACHINE_COLUMN_SIZE,
        meta: {
          dataType: CellDataType.Combobox,
          renderFilter: ({ value, onChange }) => (
            <ComboboxMachine
              testId="combobox-filter-machine"
              activeItemId={value}
              onValueChange={(machine) => onChange(machine?.id ?? null)}
              placeholder={<FunnelIcon />}
              showChevron={false}
              take={50}
              nullable
              triggerProps={{ variant: "secondary" }}
              className="w-fit"
            />
          ),
          filterFieldName: "assignedMachineId",
        },
      }),
      columnHelper.display({
        cell: ({ row }) => (
          <ModelActions
            {...(isAdmin && tableMode === TableMode.Editable
              ? {
                  ...(getProductionOrderStatus(row.original) !== ProductionOrderStatus.Deleted && {
                    deleteButton: {
                      dialogTitle: PRODUCTION_ORDER_DELETE_TITLE,
                      dialogDescription: PRODUCTION_ORDER_DELETE_MESSAGE,
                      serializedModel: serializeProductionOrder(row.original),
                      onConfirm: () =>
                        void showToastOnTransaction({
                          transaction: () =>
                            dbClient.collection(productionOrderCollection).delete(row.original.id, {
                              optimistic: import.meta.env.VITE_ENV_NAME !== "test",
                            }),
                          onSuccess: {
                            title: PRODUCTION_ORDER_DELETED_MESSAGE,
                          },
                        }),
                    },
                  }),
                  // Only an Orden de producción deleted on its own can be restored, the ones deleted along with
                  // their Pedido de venta or Línea come back when those are restored
                  ...(row.original.deletedAt !== null && {
                    restoreButton: {
                      dialogTitle: PRODUCTION_ORDER_RESTORE_TITLE,
                      dialogDescription: PRODUCTION_ORDER_RESTORE_MESSAGE,
                      serializedModel: serializeProductionOrder(row.original),
                      onConfirm: () =>
                        void showToastOnTRPCMutation({
                          mutation: trpc.productionOrder.restore.mutate({ id: row.original.id }),
                          onSuccess: { title: PRODUCTION_ORDER_RESTORED_MESSAGE },
                        }),
                    },
                  }),
                  onEdit: async () => handleOpenEditDialog(row.original.id),
                }
              : {})}
            extraComponentsStart={
              <DialogBlueprintViewer
                title={`${BLUEPRINTS_OF_PART_TITLE} "${row.original.sellOrderLine?.partReference?.reference ?? row.original.part?.description}"`}
                blueprints={row.original.part?.blueprints}
              />
            }
          />
        ),
        header: ACTIONS_LABEL,
        id: "actions",
      }),
    ],
    [tableMode, isAdmin, handleOpenEditDialog, dbClient, showToastOnTransaction, showToastOnTRPCMutation],
  );

  return (
    <BaseTable
      defaultState={DEFAULT_STATE}
      testId={testId}
      state={state}
      tableMode={tableMode}
      columns={columns}
      rows={productionOrders}
      rowCount={rowCount}
      virtualized={state?.pagination === null}
      isLoading={props.isLoading === true || isLoadingProductionOrders}
      renderSubRows={ProductionOrderSubRow}
      getRowVariant={(row) => (row.urgent ? "urgent" : undefined)}
      headerExtraComponents={
        <>
          <Button
            testId="button-toggle-pagination"
            variant="secondary"
            onClick={() =>
              navigateOnStateChange((prev) => {
                if (prev?.pagination === null) {
                  // eslint-disable-next-line @typescript-eslint/no-unused-vars
                  const { pagination, ...rest } = prev;
                  return rest;
                }
                return { ...prev, pagination: null };
              })
            }
          >
            {state?.pagination === null ? <ListOrderedIcon /> : <ListIcon />}
            {state?.pagination === null ? PAGINATE_LABEL : SHOW_ALL_LABEL}
          </Button>
          {isAdmin && (
            <ButtonLink variant="success" to="/create-production-order">
              <PlusIcon /> {PRODUCTION_ORDER_CREATE_TITLE}
            </ButtonLink>
          )}
        </>
      }
      title={({ rowCount }) => <>{rowCount} Órdenes de producción</>}
      {...props}
    />
  );
}

interface ProductionOrderSubRowProps {
  row: Row<TBaseTableFeatures, TProductionOrderTableRow>;
}

function ProductionOrderSubRow({ row }: ProductionOrderSubRowProps) {
  return (
    <TableRow testId={String(row.original.id)} variant="subrow" rowType="subrow">
      <TableCell colSpan={row.getAllCells().length} className="p-4">
        <FormProductionOrder
          key={JSON.stringify(row.original)}
          requestedFormMode={FormMode.ReadOnly}
          productionOrderId={row.original.id}
        />
      </TableCell>
    </TableRow>
  );
}
