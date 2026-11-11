import { useNavigate } from "@tanstack/react-router";
import type { Row } from "@tanstack/react-table";
import { FunnelIcon, PlusIcon } from "lucide-react";
import { useCallback, useMemo } from "react";

import ComboboxClient from "@/components/combobox/client";
import CreateEditDeliveryNoteDialog from "@/components/dialog/create-edit-delivery-note";
import DialogPrintDeliveryNote from "@/components/dialog/print-delivery-note";
import PopoverPartPickerFilter from "@/components/popover/part-picker-filter";
import type { PublicBaseTableProps, TBaseTableFeatures } from "@/components/table/base-table";
import BaseTable from "@/components/table/base-table";
import { createTableColumnHelper } from "@/components/table/column-helper";
import ButtonLink from "@/components/ui/button-link";
import { ModelActions } from "@/components/ui/model-actions";
import { TableCell, TableRow } from "@/components/ui/table";
import { useAppContext } from "@/contexts/app-context";
import { FormContextProvider } from "@/form";
import FormDeliveryNote from "@/form/forms/delivery-note";
import useDeliveryNoteForm from "@/form/hooks/use-delivery-note";
import { formatDate } from "@/lib/formatters";
import { serializeDeliveryNote } from "@/lib/serializers";
import { ACTIONS_LABEL, CLIENT_LABEL, DATE_LABEL, NUMBER_LABEL, PARTS_LABEL } from "@/messages/common";
import {
  DELIVERY_NOTE_DELETE_MESSAGE,
  DELIVERY_NOTE_DELETE_TITLE,
  DELIVERY_NOTE_CREATE_TITLE,
  DELIVERY_NOTE_DELETED_MESSAGE,
} from "@/messages/delivery-note";
import type { TDeliveryNote } from "@/queries/delivery-note";
import { useQueryDeliveryNotes } from "@/queries/delivery-note";
import type { TTableDeliveryNoteState } from "@/schemas/delivery-note";
import trpc from "@/trpc/trpc-client";
import { CellDataType, FormMode, TableMode } from "@/types";

const DEFAULT_STATE: TTableDeliveryNoteState = { sorts: [{ desc: true, id: "id" }] };

interface TableMaintenanceDeliveryNoteProps extends PublicBaseTableProps<TDeliveryNote, TTableDeliveryNoteState> {
  tableMode: TableMode;
  createDeliveryNote?: boolean;
  createDeliveryNoteLine?: boolean;
  editDeliveryNoteId?: number;
  printTagDeliveryNoteLineId?: number;
  tableClassName?: string;
}

const columnHelper = createTableColumnHelper<TDeliveryNote>();

export default function TableDeliveryNote({
  testId = "table-delivery-note",
  tableMode,
  state,
  createDeliveryNote,
  createDeliveryNoteLine,
  editDeliveryNoteId,
  printTagDeliveryNoteLineId,
  ...props
}: TableMaintenanceDeliveryNoteProps) {
  const navigate = useNavigate();

  const { isAdmin, showToastOnTRPCMutation } = useAppContext();

  const handleOpenEditDialog = useCallback(
    async (deliveryNoteId: number) => {
      await navigate({
        search: (prev) => ({ ...prev, editDeliveryNoteId: deliveryNoteId }),
        to: ".",
      });
    },
    [navigate],
  );

  const { data: deliveryNotes, isLoading, rowCount } = useQueryDeliveryNotes(state);

  const columns = useMemo(
    () => [
      columnHelper.accessor("id", {
        header: NUMBER_LABEL,
        id: "id",
        enableColumnFilter: true,
        enableSorting: true,
        meta: { dataType: CellDataType.Number },
      }),
      columnHelper.accessor((deliveryNote) => deliveryNote.client?.name, {
        header: CLIENT_LABEL,
        id: "client",
        enableColumnFilter: true,
        enableSorting: true,
        enableResizing: true,
        size: 300,
        meta: {
          dataType: CellDataType.Combobox,
          renderFilter: ({ value, onChange }) => (
            <ComboboxClient
              testId="combobox-filter-client"
              activeItemId={value}
              onValueChange={(client) => onChange(client?.id ?? null)}
              placeholder={<FunnelIcon />}
              showChevron={false}
              nullable
              triggerProps={{ variant: "secondary" }}
              className="w-fit"
            />
          ),
          filterFieldName: "clientId",
        },
      }),
      columnHelper.accessor((deliveryNote) => deliveryNote.deliveryNoteLines.length, {
        header: PARTS_LABEL,
        id: "linesCount",
        meta: { dataType: CellDataType.Number },
      }),
      columnHelper.accessor("deliveryDate", {
        cell: (info) => formatDate(info.getValue()),
        header: DATE_LABEL,
        id: "deliveryDate",
        enableSorting: true,
      }),
      columnHelper.display({
        cell: ({ row }) => (
          <ModelActions
            {...(isAdmin
              ? {
                  deleteButton: {
                    dialogTitle: DELIVERY_NOTE_DELETE_TITLE,
                    dialogDescription: DELIVERY_NOTE_DELETE_MESSAGE,
                    serializedModel: serializeDeliveryNote(row.original),
                    onConfirm: () =>
                      void showToastOnTRPCMutation({
                        mutation: trpc.deliveryNote.delete.mutate({ id: row.original.id }),
                        onSuccess: {
                          title: DELIVERY_NOTE_DELETED_MESSAGE,
                          description: `El albarán ${row.original.id} ha sido eliminado correctamente`,
                        },
                      }),
                  },
                  onEdit: async () => handleOpenEditDialog(row.original.id),
                }
              : {})}
            extraComponentsStart={<DialogPrintDeliveryNote deliveryNoteId={row.original.id} iconOnly />}
          />
        ),
        header: ACTIONS_LABEL,
        id: "actions",
        size: isAdmin ? 150 : 80,
      }),
    ],
    [isAdmin, handleOpenEditDialog, showToastOnTRPCMutation],
  );

  const renderSubRows = useCallback(
    ({ row }: { row: Row<TBaseTableFeatures, TDeliveryNote> }) => (
      <DeliveryNoteSubRow row={row} printTagDeliveryNoteLineId={printTagDeliveryNoteLineId} />
    ),
    [printTagDeliveryNoteLineId],
  );

  return (
    <>
      <BaseTable
        testId={testId}
        columns={columns}
        rows={deliveryNotes}
        rowCount={rowCount}
        state={state}
        isLoading={isLoading}
        defaultState={DEFAULT_STATE}
        renderSubRows={renderSubRows}
        customFiltersComponent={
          <PopoverPartPickerFilter
            testId="popover-delivery-note-filters"
            filters={state?.filters}
            tableName={testId}
            defaultState={DEFAULT_STATE}
            onStateChange={props.onStateChange}
          />
        }
        headerExtraComponents={
          tableMode == TableMode.Editable ? (
            <ButtonLink variant="success" to="." search={(prev) => ({ ...prev, createDeliveryNote: true })}>
              <PlusIcon /> {DELIVERY_NOTE_CREATE_TITLE}
            </ButtonLink>
          ) : undefined
        }
        {...props}
      />
      <CreateEditDeliveryNoteDialog
        createDeliveryNote={createDeliveryNote}
        createDeliveryNoteLine={createDeliveryNoteLine}
        editDeliveryNoteId={editDeliveryNoteId}
        printTagDeliveryNoteLineId={printTagDeliveryNoteLineId}
      />
    </>
  );
}

interface DeliveryNoteSubRowProps {
  row: Row<TBaseTableFeatures, TDeliveryNote>;
  printTagDeliveryNoteLineId?: number;
}

function DeliveryNoteSubRow({ row, printTagDeliveryNoteLineId }: DeliveryNoteSubRowProps) {
  const { form, validationSchema, isLoading } = useDeliveryNoteForm({
    controlledDeliveryNote: row.original,
    requestedFormMode: FormMode.ReadOnly,
  });

  return (
    <TableRow testId={String(row.original.id)} variant="subrow" rowType="subrow">
      <TableCell colSpan={row.getAllCells().length} className="p-4">
        <FormContextProvider
          form={form}
          formMode={FormMode.ReadOnly}
          isLoading={isLoading}
          validationSchema={validationSchema}
        >
          <FormDeliveryNote
            key={JSON.stringify(row.original)}
            deliveryNote={row.original}
            printTagDeliveryNoteLineId={printTagDeliveryNoteLineId}
          />
        </FormContextProvider>
      </TableCell>
    </TableRow>
  );
}
