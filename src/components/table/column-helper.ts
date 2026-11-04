import type { Cell, RowData } from "@tanstack/react-table";
import {
  createColumnHelper,
  tableFeatures,
  rowExpandingFeature,
  rowPaginationFeature,
  columnFilteringFeature,
  rowSortingFeature,
  columnSizingFeature,
  columnResizingFeature,
  createPaginatedRowModel,
} from "@tanstack/react-table";

export const baseTableFeatures = tableFeatures({
  rowExpandingFeature,
  rowPaginationFeature,
  columnFilteringFeature,
  rowSortingFeature,
  columnSizingFeature,
  columnResizingFeature,
  paginatedRowModel: createPaginatedRowModel(),
});

export function createTableColumnHelper<TData extends RowData>() {
  return createColumnHelper<typeof baseTableFeatures, TData>();
}

export function isCellEditable<TData extends RowData>(cell: Cell<typeof baseTableFeatures, TData>): boolean {
  const editable = cell.column.columnDef.meta?.editable;
  return typeof editable === "function" ? editable(cell.row.original) : editable === true;
}

export const DEFAULT_CLIENT_COLUMN_SIZE = 300;
export const DEFAULT_DESCRIPTION_COLUMN_SIZE = 400;
export const DEFAULT_REFERENCE_COLUMN_SIZE = 200;
export const DEFAULT_SELL_ORDER_COLUMN_SIZE = 250;
export const DEFAULT_DATE_COLUMN_SIZE = 100;
export const DEFAULT_DATETIME_COLUMN_SIZE = 140;
export const DEFAULT_MACHINE_COLUMN_SIZE = 220;
