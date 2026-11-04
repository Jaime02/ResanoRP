import type { Row } from "@tanstack/react-table";
import { useMemo, useState } from "react";

import type { PublicBaseTableProps, TBaseTableFeatures } from "@/components/table/base-table";
import BaseTable from "@/components/table/base-table";
import { createTableColumnHelper } from "@/components/table/column-helper";
import { ButtonCopyLayout } from "@/components/ui/button-copy";
import ButtonLink from "@/components/ui/button-link";
import { TableCell, TableRow } from "@/components/ui/table";
import type { TPendingDeliveryNoteLineRow, TPendingDeliveryNoteRow } from "@/form/hooks/use-create-invoice";
import { formatDate, formatPrice } from "@/lib/formatters";
import { formatCents, getLineTotalInCents } from "@/lib/prices";
import {
  CLIENT_LABEL,
  DATE_LABEL,
  DESCRIPTION_LABEL,
  PARTS_LABEL,
  PRICE_LABEL,
  QUANTITY_LABEL,
  REFERENCE_LABEL,
  TOTAL_LABEL,
} from "@/messages/common";
import {
  DELIVERY_NOTE_LABEL,
  DELIVERY_NOTE_NO_PARTS_MESSAGE,
  NO_PENDING_DELIVERY_NOTES_MESSAGE,
} from "@/messages/delivery-note";
import { SELL_ORDER_LABEL } from "@/messages/sell-order";
import type { TTableState } from "@/schemas";
import { CellDataType } from "@/types";
import { PENDING_DELIVERY_NOTES_PAGE_SIZE } from "@/types/invoice";

interface TablePendingDeliveryNoteProps extends PublicBaseTableProps<TPendingDeliveryNoteRow> {
  rows: Array<TPendingDeliveryNoteRow>;
}

const columnHelper = createTableColumnHelper<TPendingDeliveryNoteRow>();

export default function TablePendingDeliveryNote({
  testId = "table-pending-delivery-note",
  rows,
  ...props
}: TablePendingDeliveryNoteProps) {
  const [state, setState] = useState<TTableState | undefined>({
    pagination: { pageSize: PENDING_DELIVERY_NOTES_PAGE_SIZE },
  });

  const columns = useMemo(
    () => [
      columnHelper.accessor("id", {
        header: DELIVERY_NOTE_LABEL,
        id: "id",
        meta: { dataType: CellDataType.Number },
      }),
      columnHelper.accessor((deliveryNote) => deliveryNote.client?.name, {
        header: CLIENT_LABEL,
        id: "client",
      }),
      columnHelper.accessor("deliveryDate", {
        cell: (info) => formatDate(info.getValue()),
        header: DATE_LABEL,
        id: "deliveryDate",
      }),
      columnHelper.accessor((deliveryNote) => deliveryNote.deliveryNoteLines.length, {
        header: PARTS_LABEL,
        id: "linesCount",
        meta: { dataType: CellDataType.Number },
      }),
      columnHelper.accessor("totalInCents", {
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
      rows={rows}
      state={state}
      onStateChange={setState}
      noDataMessage={NO_PENDING_DELIVERY_NOTES_MESSAGE}
      skeletonRowsCount={3}
      renderSubRows={PendingDeliveryNoteSubRow}
      {...props}
    />
  );
}

interface PendingDeliveryNoteSubRowProps {
  row: Row<TBaseTableFeatures, TPendingDeliveryNoteRow>;
}

function PendingDeliveryNoteSubRow({ row }: PendingDeliveryNoteSubRowProps) {
  return (
    <TableRow testId={String(row.original.id)} variant="subrow" rowType="subrow">
      <TableCell colSpan={row.getAllCells().length} className="p-2">
        <TablePendingDeliveryNoteLine rows={row.original.deliveryNoteLines} />
      </TableCell>
    </TableRow>
  );
}

const lineColumnHelper = createTableColumnHelper<TPendingDeliveryNoteLineRow>();

interface TablePendingDeliveryNoteLineProps extends PublicBaseTableProps<TPendingDeliveryNoteLineRow> {
  rows: Array<TPendingDeliveryNoteLineRow>;
}

function TablePendingDeliveryNoteLine({
  testId = "table-pending-delivery-note-line",
  rows,
  ...props
}: TablePendingDeliveryNoteLineProps) {
  const [state, setState] = useState<TTableState>();

  const columns = useMemo(
    () => [
      lineColumnHelper.accessor((deliveryNoteLine) => deliveryNoteLine.partReference?.reference, {
        cell: ({ row }) =>
          row.original.partReference && (
            <ButtonCopyLayout value={row.original.partReference.reference}>
              <ButtonLink to="/part/$id" params={{ id: row.original.partReference.partId }} target="_blank">
                {row.original.partReference.reference}
              </ButtonLink>
            </ButtonCopyLayout>
          ),
        header: REFERENCE_LABEL,
        id: "partReference",
      }),
      lineColumnHelper.accessor("description", {
        header: DESCRIPTION_LABEL,
        id: "description",
      }),
      lineColumnHelper.accessor((deliveryNoteLine) => deliveryNoteLine.sellOrderLine?.sellOrder?.clientReference, {
        cell: ({ row }) => {
          const sellOrder = row.original.sellOrderLine?.sellOrder;
          if (!sellOrder) return null;
          const sellOrderReference = sellOrder.clientReference ?? String(sellOrder.id);
          return (
            <ButtonCopyLayout value={sellOrderReference}>
              <ButtonLink to="/sell-order/$id" params={{ id: sellOrder.id }} target="_blank">
                {sellOrderReference}
              </ButtonLink>
            </ButtonCopyLayout>
          );
        },
        header: SELL_ORDER_LABEL,
        id: "sellOrder",
      }),
      lineColumnHelper.accessor("quantity", {
        header: QUANTITY_LABEL,
        id: "quantity",
        meta: { dataType: CellDataType.Number },
      }),
      lineColumnHelper.accessor("unitPrice", {
        cell: (info) => {
          const unitPrice = info.getValue();
          return unitPrice !== null ? formatPrice(unitPrice) : "";
        },
        header: PRICE_LABEL,
        id: "unitPrice",
        meta: { dataType: CellDataType.Price },
      }),
      lineColumnHelper.accessor((deliveryNoteLine) => getLineTotalInCents(deliveryNoteLine), {
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
      rows={rows}
      state={state}
      onStateChange={setState}
      noDataMessage={DELIVERY_NOTE_NO_PARTS_MESSAGE}
      skeletonRowsCount={1}
      {...props}
    />
  );
}
