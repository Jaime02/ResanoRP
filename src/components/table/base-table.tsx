import { flexRender, useTable } from "@tanstack/react-table";
import type { Cell, ColumnDef, ExpandedState, Row } from "@tanstack/react-table";
import { ChevronLeftIcon, ChevronRightIcon, ChevronsLeftIcon, ChevronsRightIcon } from "lucide-react";
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import BaseTableHead from "@/components/table/base-table-head";
import { baseTableFeatures, isCellEditable } from "@/components/table/column-helper";
import { CustomFiltersContext } from "@/components/table/custom-filters-context";
import EditableCell from "@/components/table/editable-cell";
import expanderCustomFiltersColumn, { EXPANDER_COLUMN_ID } from "@/components/table/expander-custom-filters-column";
import NoDataRow from "@/components/table/no-data-row";
import type { TOnRadioSelectedRowChange } from "@/components/table/radio-column";
import radioColumn from "@/components/table/radio-column";
import SkeletonRow from "@/components/table/skeleton-row";
import VirtualizedRows from "@/components/table/virtualized-rows";
import { Button } from "@/components/ui/button";
import Header from "@/components/ui/header";
import { RadioGroup } from "@/components/ui/radio";
import { Skeleton } from "@/components/ui/skeleton";
import type { TableProps } from "@/components/ui/table";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { useTableStateSearch } from "@/lib/use-table-state-search";
import { cn } from "@/lib/utils";
import {
  FIRST_PAGE_LABEL,
  LAST_PAGE_LABEL,
  NEXT_PAGE_LABEL,
  NO_DATA_MESSAGE,
  PREVIOUS_PAGE_LABEL,
} from "@/messages/common";
import type { TBaseModel, TTableState } from "@/schemas";
import { CellDataType, TableMode } from "@/types";

type TTitleFunction = ({
  pageIndex,
  pageSize,
  pageCount,
  rowCount,
}: {
  pageIndex?: number;
  pageSize?: number;
  pageCount: number;
  rowCount: React.ReactNode;
}) => React.ReactNode;

export interface PublicBaseTableProps<TRow extends TBaseModel, TState extends TTableState = TTableState> extends Omit<
  TableProps,
  "title"
> {
  tableMode?: TableMode;
  onRowEdit?: (cell: Cell<TBaseTableFeatures, TRow>, value: unknown) => void | Promise<void>;
  onRowChange?: (cell: Cell<TBaseTableFeatures, TRow>, value: unknown) => void;
  title?: string | TTitleFunction | null;
  onExpandedChange?: (expandedState: ExpandedState) => void;
  radioSelectedRowId?: TRow["id"] | null;
  onRadioSelectedRowChange?: TOnRadioSelectedRowChange<TRow>;
  skeletonRowsCount?: number;
  renderSubRows?: (props: { row: Row<TBaseTableFeatures, TRow> }) => React.ReactNode;
  headerExtraComponents?: React.ReactNode;
  customFiltersComponent?: React.ReactNode;
  className?: string;
  tableClassName?: string;
  highlightRowOnHover?: boolean;
  noDataMessage?: React.ReactNode;
  isLoading?: boolean;
  rowCount?: number | null;
  virtualized?: boolean;
  state?: TState;
  defaultState?: TState;
  onStateChange?: (updater: React.SetStateAction<TTableState | undefined>) => void;
}

interface BaseTableProps<TRow extends TBaseModel, TState extends TTableState> extends Omit<
  PublicBaseTableProps<TRow, TState>,
  "testId"
> {
  testId: string;
  columns: ReadonlyArray<ColumnDef<TBaseTableFeatures, TRow, any>>;
  rows?: Array<TRow>;
}

export type TBaseTableFeatures = typeof baseTableFeatures;

export default function BaseTable<TRow extends TBaseModel, TState extends TTableState>({
  testId,
  tableMode = TableMode.ReadOnly,
  onRowEdit,
  onRowChange,
  title,
  columns,
  rows,
  state,
  defaultState,
  onExpandedChange,
  radioSelectedRowId,
  onRadioSelectedRowChange,
  skeletonRowsCount,
  renderSubRows,
  headerExtraComponents,
  customFiltersComponent,
  className,
  tableClassName,
  disabledMessage,
  noDataMessage = NO_DATA_MESSAGE,
  highlightRowOnHover = true,
  isLoading = false,
  rowCount,
  virtualized = false,
  onStateChange,
}: BaseTableProps<TRow, TState>) {
  const [expandedState, setExpandedState] = useState<ExpandedState>({});

  const navigateOnStateSearch = useTableStateSearch<TTableState>(testId, defaultState);
  const navigateOnStateChange = onStateChange ?? navigateOnStateSearch;

  // Omits `pageIndex` on the first page (and `pagination` altogether once empty) so that
  // paging back to the start leaves no leftover search param in the url.
  const navigateToPage = useCallback(
    (getPageIndex: (currentPageIndex: number) => number) => {
      navigateOnStateChange((prev?: TTableState) => {
        const pageIndex = Math.max(getPageIndex(prev?.pagination?.pageIndex ?? 0), 0);
        const pageSize = prev?.pagination?.pageSize;
        const pagination = {
          ...(pageIndex !== 0 ? { pageIndex } : {}),
          ...(pageSize !== undefined ? { pageSize } : {}),
        };
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { pagination: _previousPagination, ...rest } = prev ?? {};
        return Object.keys(pagination).length > 0 ? { ...rest, pagination } : rest;
      });
    },
    [navigateOnStateChange],
  );

  const hasCustomFiltersComponent = customFiltersComponent !== undefined;
  const memoizedExpanderCustomFiltersColumn = useMemo(
    () => expanderCustomFiltersColumn<TRow>({ hasCustomFilters: hasCustomFiltersComponent }),
    [hasCustomFiltersComponent],
  );
  const memoizedRadioColumn = useMemo(() => radioColumn<TRow>(onRadioSelectedRowChange), [onRadioSelectedRowChange]);

  const memoizedColumns = useMemo(
    () => [
      ...(tableMode === TableMode.Radio ? [memoizedRadioColumn] : []),
      ...(renderSubRows || hasCustomFiltersComponent ? [memoizedExpanderCustomFiltersColumn] : []),
      ...columns,
    ],
    [
      tableMode,
      memoizedRadioColumn,
      renderSubRows,
      hasCustomFiltersComponent,
      memoizedExpanderCustomFiltersColumn,
      columns,
    ],
  );

  const memoizedRows = useMemo(() => rows ?? [], [rows]);
  const sorting = state?.sorts ?? defaultState?.sorts;

  const table = useTable(
    {
      features: baseTableFeatures,
      data: memoizedRows,
      columns: memoizedColumns,
      rowCount: rowCount ?? undefined,
      getRowId: (row) => String(row.id),
      getRowCanExpand: () => Boolean(renderSubRows),
      manualFiltering: true,
      manualSorting: true,
      manualPagination: rowCount !== undefined,
      state: {
        pagination: {
          pageIndex: state?.pagination?.pageIndex ?? 0,
          pageSize: state?.pagination === null ? Infinity : (state?.pagination?.pageSize ?? 10),
        },
        expanded: expandedState,
        sorting,
        columnFilters: state?.filters ?? defaultState?.filters,
      },
      defaultColumn: {
        enableColumnFilter: false,
        enableResizing: false,
        enableSorting: false,
        size: 0,
      },
      onSortingChange: (updater) => {
        const nextSorts = typeof updater === "function" ? updater(sorting ?? []) : updater;
        navigateOnStateChange((prev) => {
          if (nextSorts.length === 0) {
            if (prev == null) return prev;
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { sorts, ...rest } = prev;
            return rest;
          }
          return {
            ...(prev ?? {}),
            sorts: nextSorts,
          };
        });
      },
      onExpandedChange: (updaterOrValue) => {
        onExpandedChange?.(typeof updaterOrValue === "function" ? updaterOrValue(expandedState) : updaterOrValue);
        setExpandedState(updaterOrValue);
      },
      columnResizeMode: "onChange",
    },
    // Column widths are CSS variables written below, so resizing must not re-render every cell on each frame
    (tableState) => ({ pagination: tableState.pagination }),
  );

  const rootRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);

  const getColumnSizeVars = useCallback(
    () =>
      Object.fromEntries(table.getAllLeafColumns().map((column, i) => [`--col-${i}-size`, `${column.getSize()}px`])),
    [table],
  );
  useLayoutEffect(() => {
    // Centered tables re-center as they resize, so the left edge is held in place during the drag to keep the
    // resize handle under the cursor
    let resizeAnchorLeft: number | undefined;
    return table.atoms.columnSizing.subscribe(() => {
      const root = rootRef.current;
      if (!root) return;
      const heldTranslate = root.style.translate;
      root.style.translate = "";
      const isResizing = table.atoms.columnResizing.get().isResizingColumn !== false;
      resizeAnchorLeft = isResizing ? (resizeAnchorLeft ?? root.getBoundingClientRect().left) : undefined;
      Object.entries(getColumnSizeVars()).forEach(([name, value]) => tableRef.current?.style.setProperty(name, value));
      if (resizeAnchorLeft !== undefined) {
        root.style.translate = `${resizeAnchorLeft - root.getBoundingClientRect().left}px`;
      } else if (heldTranslate !== "") {
        root.animate({ translate: [heldTranslate, "0px"] }, { duration: 150, easing: "ease-out" });
      }
    }).unsubscribe;
  }, [table, getColumnSizeVars]);

  const tableRows = table.getRowModel().rows;
  const tbodyRef = useRef<HTMLTableSectionElement>(null);

  const renderRow = (
    row: Row<TBaseTableFeatures, TRow>,
    rowIndex: number,
    measureElement?: (element: HTMLTableRowElement | null) => void,
  ) => (
    <Fragment key={row.id}>
      <TableRow
        ref={measureElement}
        data-index={measureElement ? rowIndex : undefined}
        testId={String(row.original.id)}
        highlightOnHover={highlightRowOnHover}
      >
        {row.getAllCells().map((cell, cellIndex, cells) => {
          const isHiddenExpanderCell = (columnId?: string) => columnId === EXPANDER_COLUMN_ID && !row.getCanExpand();
          if (isHiddenExpanderCell(cell.column.id)) return null;
          // Takes over the empty space left by the expander of a row that has nothing to expand
          const spansExpanderCell = isHiddenExpanderCell(cells[cellIndex - 1]?.column.id);
          const size = spansExpanderCell
            ? `calc(var(--col-${cellIndex - 1}-size) + var(--col-${cellIndex}-size))`
            : `var(--col-${cellIndex}-size)`;
          return (
            <TableCell
              key={cell.id}
              testId={cell.column.id}
              colSpan={spansExpanderCell ? 2 : undefined}
              style={{
                maxWidth: cell.column.getCanResize() ? size : undefined,
                width: size,
              }}
              className={cn(
                cell.column.columnDef.meta?.dataType !== undefined &&
                  [CellDataType.Number, CellDataType.Price, CellDataType.Decimal].includes(
                    cell.column.columnDef.meta.dataType,
                  )
                  ? "text-right tabular-nums"
                  : undefined,
                cell.column.columnDef.meta?.cellClassName,
              )}
            >
              {tableMode === TableMode.Editable && isCellEditable(cell) ? (
                <EditableCell cell={cell} onRowEdit={onRowEdit} onRowChange={onRowChange} />
              ) : (
                flexRender(cell.column.columnDef.cell, cell.getContext())
              )}
            </TableCell>
          );
        })}
      </TableRow>
      {row.getIsExpanded() && renderSubRows?.({ row })}
    </Fragment>
  );

  const pageRowsCount = tableRows.length;
  useEffect(() => {
    if (!isLoading && rows !== undefined && pageRowsCount === 0 && (state?.pagination?.pageIndex ?? 0) > 0) {
      navigateToPage(() => 0);
    }
  }, [isLoading, rows, pageRowsCount, navigateToPage, state?.pagination?.pageIndex]);

  const isPaginationUnknown = Boolean(state?.pagination) && (isLoading || rowCount === null);

  return (
    <RadioGroup
      ref={rootRef}
      value={String(radioSelectedRowId)}
      className={cn("flex w-fit max-w-full flex-col items-stretch gap-2", className)}
    >
      {((title !== undefined && title !== null) ||
        headerExtraComponents !== undefined ||
        isPaginationUnknown ||
        table.getPageCount() > 1) && (
        <div className="flex items-center justify-end gap-3">
          {title !== undefined && title !== null && (
            <Header level={2} className="flex-1">
              {typeof title === "string"
                ? title
                : title({
                    ...state?.pagination,
                    rowCount: rowCount ?? <Skeleton className="h-[1em] w-[4ch]" />,
                    pageCount: table.getPageCount(),
                  })}
            </Header>
          )}
          {isPaginationUnknown && <Skeleton className="h-10 w-75 shrink-0" />}
          {!isPaginationUnknown && table.getPageCount() > 1 && (
            <div className="flex shrink-0 items-center justify-center gap-2">
              <Button
                size="icon"
                aria-label={FIRST_PAGE_LABEL}
                onClick={() => navigateToPage(() => 0)}
                disabled={table.getCanPreviousPage() === false}
              >
                <ChevronsLeftIcon />
              </Button>
              <Button
                size="icon"
                aria-label={PREVIOUS_PAGE_LABEL}
                onClick={() => navigateToPage((currentPageIndex) => currentPageIndex - 1)}
                disabled={table.getCanPreviousPage() === false}
              >
                <ChevronLeftIcon />
              </Button>
              <span className="min-w-[13ch] text-center text-sm whitespace-nowrap tabular-nums">
                Página {table.getPageCount() > 0 ? table.state.pagination.pageIndex + 1 : 0} de {table.getPageCount()}
              </span>
              <Button
                aria-label={NEXT_PAGE_LABEL}
                size="icon"
                onClick={() => navigateToPage((currentPageIndex) => currentPageIndex + 1)}
                disabled={table.getCanNextPage() === false}
              >
                <ChevronRightIcon />
              </Button>
              <Button
                size="icon"
                aria-label={LAST_PAGE_LABEL}
                onClick={() => navigateToPage(() => table.getPageCount() - 1)}
                disabled={table.getCanNextPage() === false}
              >
                <ChevronsRightIcon />
              </Button>
            </div>
          )}
          {headerExtraComponents !== undefined && (
            <div className="flex shrink-0 justify-end gap-2">{headerExtraComponents}</div>
          )}
        </div>
      )}
      <Table
        ref={tableRef}
        testId={testId}
        data-row-count={isLoading || rows === undefined || rowCount === null ? undefined : table.getRowCount()}
        disabledMessage={disabledMessage}
        tableClassName={cn("w-max min-w-full", tableClassName)}
        style={getColumnSizeVars()}
      >
        <CustomFiltersContext value={customFiltersComponent}>
          <BaseTableHead
            table={table}
            hasRows={rows ? rows.length > 0 : false}
            thStyle={(header) => ({
              maxWidth: header.column.getCanResize() ? `var(--col-${header.index}-size)` : undefined,
              width: `var(--col-${header.index}-size)`,
            })}
            onStateChange={navigateOnStateChange}
          />
        </CustomFiltersContext>
        <TableBody ref={tbodyRef}>
          {isLoading || disabledMessage !== undefined ? (
            Array.from({ length: skeletonRowsCount ?? state?.pagination?.pageSize ?? 10 }).map((_, index) => (
              <SkeletonRow
                key={index}
                columns={table.getAllLeafColumns().length}
                hasExpanderColumn={Boolean(renderSubRows)}
                hasRadioColumn={tableMode === TableMode.Radio}
              />
            ))
          ) : rows === undefined || rows.length === 0 ? (
            <NoDataRow columns={table.getAllLeafColumns().length} message={noDataMessage} />
          ) : virtualized ? (
            <VirtualizedRows rows={tableRows} tbodyRef={tbodyRef} renderRow={renderRow} />
          ) : (
            tableRows.map((row, rowIndex) => renderRow(row, rowIndex))
          )}
        </TableBody>
      </Table>
    </RadioGroup>
  );
}
