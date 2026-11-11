import type { Row } from "@tanstack/react-table";
import { MailIcon, PlusIcon } from "lucide-react";
import { useMemo, useState } from "react";

import DialogAccountInvoices from "@/components/dialog/account-invoices";
import CreateInvoiceDialog from "@/components/dialog/create-invoice";
import DialogPrintInvoice from "@/components/dialog/print-invoice";
import DialogUnaccountInvoice from "@/components/dialog/unaccount-invoice";
import type { PublicBaseTableProps, TBaseTableFeatures } from "@/components/table/base-table";
import BaseTable from "@/components/table/base-table";
import { createTableColumnHelper } from "@/components/table/column-helper";
import { Button } from "@/components/ui/button";
import ButtonLink from "@/components/ui/button-link";
import { Checkbox } from "@/components/ui/checkbox";
import { ModelActions } from "@/components/ui/model-actions";
import { TableCell, TableRow } from "@/components/ui/table";
import { useAppContext } from "@/contexts/app-context";
import { formatDate } from "@/lib/formatters";
import { formatCents } from "@/lib/prices";
import { downloadUrl } from "@/lib/print";
import { serializeInvoice } from "@/lib/serializers";
import { ACTIONS_LABEL, CLIENT_LABEL, DATE_LABEL, NUMBER_LABEL, PARTS_LABEL, TOTAL_LABEL } from "@/messages/common";
import { DELIVERY_NOTE_LABEL, DELIVERY_NOTES_LABEL } from "@/messages/delivery-note";
import {
  INVOICE_DELETE_MESSAGE,
  INVOICE_DELETE_TITLE,
  INVOICE_DELETED_MESSAGE,
  INVOICE_NO_DELIVERY_NOTES_MESSAGE,
  DUE_DATE_LABEL,
  INVOICE_ACCOUNTED_LABEL,
  INVOICE_SENT_LABEL,
  INVOICE_CREATE_TITLE,
  SEND_INVOICE_LABEL,
} from "@/messages/invoice";
import { BASE_LABEL } from "@/messages/part-price";
import type { TInvoiceDeliveryNote, TInvoiceTableRow } from "@/queries/invoice";
import { DEFAULT_INVOICE_SORTING, useQueryInvoiceTable } from "@/queries/invoice";
import type { TTableInvoiceState } from "@/schemas/invoice";
import trpc from "@/trpc/trpc-client";
import { CellDataType } from "@/types";

const DEFAULT_STATE: TTableInvoiceState = { sorts: DEFAULT_INVOICE_SORTING };

interface TableInvoiceProps extends PublicBaseTableProps<TInvoiceTableRow, TTableInvoiceState> {
  createInvoice?: boolean;
}

const columnHelper = createTableColumnHelper<TInvoiceTableRow>();

export default function TableInvoice({ testId = "table-invoice", state, createInvoice, ...props }: TableInvoiceProps) {
  const { isAdmin, showToastOnTRPCMutation } = useAppContext();

  const {
    data: invoices,
    rowCount,
    isLoading: isLoadingInvoices,
  } = useQueryInvoiceTable({
    filters: state?.filters ?? DEFAULT_STATE.filters,
    pagination: state?.pagination ?? DEFAULT_STATE.pagination,
    sorts: state?.sorts ?? DEFAULT_STATE.sorts,
  });

  const columns = useMemo(
    () => [
      columnHelper.accessor("id", {
        header: NUMBER_LABEL,
        id: "id",
        enableColumnFilter: true,
        enableSorting: true,
        meta: { dataType: CellDataType.Number },
      }),
      columnHelper.accessor((invoice) => invoice.client?.name, {
        header: CLIENT_LABEL,
        id: "client",
        enableResizing: true,
        size: 500,
        meta: { dataType: CellDataType.String },
      }),
      columnHelper.accessor((invoice) => invoice.deliveryNotes.length, {
        header: DELIVERY_NOTES_LABEL,
        id: "deliveryNotesCount",
        meta: { dataType: CellDataType.Number },
      }),
      columnHelper.accessor("createdAt", {
        cell: (info) => formatDate(info.getValue()),
        header: DATE_LABEL,
        id: "createdAt",
        enableSorting: true,
        meta: { dataType: CellDataType.Date },
      }),
      columnHelper.accessor("dueDate", {
        cell: (info) => formatDate(info.getValue()),
        header: DUE_DATE_LABEL,
        id: "dueDate",
        meta: { dataType: CellDataType.Date },
      }),
      columnHelper.accessor("taxableBaseInCents", {
        cell: (info) => formatCents(info.getValue()),
        header: BASE_LABEL,
        id: "taxableBase",
        size: 100,
        meta: { dataType: CellDataType.Price },
      }),
      columnHelper.accessor("totalInCents", {
        cell: (info) => formatCents(info.getValue()),
        header: TOTAL_LABEL,
        id: "total",
        size: 100,
        meta: { dataType: CellDataType.Price },
      }),
      columnHelper.accessor("accounted", {
        cell: (info) => <Checkbox testId="checkbox-accounted" className="mx-auto" checked={info.getValue()} readOnly />,
        header: INVOICE_ACCOUNTED_LABEL,
        id: "accounted",
        enableColumnFilter: true,
        meta: { dataType: CellDataType.Boolean },
      }),
      columnHelper.accessor("sent", {
        cell: (info) => <Checkbox testId="checkbox-sent" className="mx-auto" checked={info.getValue()} readOnly />,
        header: INVOICE_SENT_LABEL,
        id: "sent",
        enableColumnFilter: true,
        meta: { dataType: CellDataType.Boolean },
      }),
      ...(isAdmin
        ? [
            columnHelper.display({
              cell: ({ row }) => (
                <ModelActions
                  deleteButton={{
                    disabled: row.original.accounted,
                    dialogTitle: INVOICE_DELETE_TITLE,
                    dialogDescription: INVOICE_DELETE_MESSAGE,
                    serializedModel: serializeInvoice(row.original),
                    onConfirm: () =>
                      void showToastOnTRPCMutation({
                        mutation: trpc.invoice.delete.mutate({ id: row.original.id }),
                        onSuccess: {
                          title: INVOICE_DELETED_MESSAGE,
                          description: `La factura ${row.original.id} ha sido eliminada correctamente`,
                        },
                      }),
                  }}
                  extraComponentsStart={
                    <>
                      <DialogUnaccountInvoice invoiceId={row.original.id} disabled={row.original.accounted === false} />
                      <DialogPrintInvoice invoiceId={row.original.id} />
                      <ButtonSendInvoice invoice={row.original} />
                    </>
                  }
                />
              ),
              size: 190,
              header: ACTIONS_LABEL,
              id: "actions",
            }),
          ]
        : []),
    ],
    [isAdmin, showToastOnTRPCMutation],
  );

  return (
    <>
      <BaseTable
        testId={testId}
        columns={columns}
        rows={invoices}
        rowCount={rowCount}
        state={state}
        isLoading={props.isLoading === true || isLoadingInvoices}
        defaultState={DEFAULT_STATE}
        renderSubRows={InvoiceSubRow}
        headerExtraComponents={
          isAdmin && (
            <>
              <DialogAccountInvoices />
              <ButtonLink variant="success" to="." search={(prev) => ({ ...prev, createInvoice: true })}>
                <PlusIcon /> {INVOICE_CREATE_TITLE}
              </ButtonLink>
            </>
          )
        }
        title={({ rowCount }) => <>{rowCount} Facturas</>}
        {...props}
      />
      <CreateInvoiceDialog createInvoice={createInvoice} />
    </>
  );
}

interface ButtonSendInvoiceProps {
  invoice: TInvoiceTableRow;
}

function ButtonSendInvoice({ invoice }: ButtonSendInvoiceProps) {
  const { showToastOnTRPCMutation } = useAppContext();
  const [isSending, setIsSending] = useState(false);

  async function sendInvoice() {
    setIsSending(true);
    await showToastOnTRPCMutation({
      mutation: trpc.invoice.print.mutate({ id: invoice.id }),
      onSubmit: async () => {
        const downloadEmail = () => {
          downloadUrl(
            `/api/files/invoice/${invoice.id}?format=eml&generatedAt=${Date.now()}`,
            `Factura ${invoice.id}.eml`,
          );
        };
        if (invoice.sent) {
          downloadEmail();
          return;
        }
        // The email is only downloaded once the Factura can be sent
        await showToastOnTRPCMutation({
          mutation: trpc.invoice.send.mutate({ id: invoice.id }),
          onSubmit: async () => downloadEmail(),
        });
      },
    });
    setIsSending(false);
  }

  return (
    <Button testId="button-send-invoice" size="icon" disabled={isSending} onClick={() => void sendInvoice()}>
      <MailIcon />
      <span className="sr-only">{SEND_INVOICE_LABEL}</span>
    </Button>
  );
}

interface InvoiceSubRowProps {
  row: Row<TBaseTableFeatures, TInvoiceTableRow>;
}

function InvoiceSubRow({ row }: InvoiceSubRowProps) {
  return (
    <TableRow testId={String(row.original.id)} variant="subrow" rowType="subrow">
      <TableCell colSpan={row.getAllCells().length} className="p-4">
        <TableInvoiceDeliveryNote deliveryNotes={row.original.deliveryNotes} className="mx-auto" />
      </TableCell>
    </TableRow>
  );
}

const deliveryNoteColumnHelper = createTableColumnHelper<TInvoiceDeliveryNote>();

interface TableInvoiceDeliveryNoteProps extends PublicBaseTableProps<TInvoiceDeliveryNote> {
  deliveryNotes: Array<TInvoiceDeliveryNote>;
}

function TableInvoiceDeliveryNote({
  testId = "table-invoice-delivery-note",
  deliveryNotes,
  ...props
}: TableInvoiceDeliveryNoteProps) {
  const columns = useMemo(
    () => [
      deliveryNoteColumnHelper.accessor("id", {
        cell: ({ row }) => (
          <ButtonLink to="/delivery-note/$id" params={{ id: row.original.id }}>
            Albarán {row.original.id}
          </ButtonLink>
        ),
        header: DELIVERY_NOTE_LABEL,
        id: "id",
      }),
      deliveryNoteColumnHelper.accessor("deliveryDate", {
        cell: (info) => formatDate(info.getValue()),
        header: DATE_LABEL,
        id: "deliveryDate",
      }),
      deliveryNoteColumnHelper.accessor((deliveryNote) => deliveryNote.deliveryNoteLines.length, {
        header: PARTS_LABEL,
        id: "linesCount",
        meta: { dataType: CellDataType.Number },
      }),
      deliveryNoteColumnHelper.accessor("totalInCents", {
        cell: (info) => formatCents(info.getValue()),
        header: TOTAL_LABEL,
        id: "total",
        meta: { dataType: CellDataType.Price },
      }),
    ],
    [],
  );

  return (
    <BaseTable
      testId={testId}
      columns={columns}
      rows={deliveryNotes}
      noDataMessage={INVOICE_NO_DELIVERY_NOTES_MESSAGE}
      skeletonRowsCount={3}
      {...props}
    />
  );
}
