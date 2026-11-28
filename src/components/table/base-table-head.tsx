import type { Header, Table } from "@tanstack/react-table";
import { flexRender } from "@tanstack/react-table";
import { ArrowDownWideNarrowIcon, ChevronDownIcon, ChevronUpIcon, EllipsisVerticalIcon } from "lucide-react";
import type { CSSProperties } from "react";

import type { TBaseTableFeatures } from "@/components/table/base-table";
import { TableHeadFilter } from "@/components/table/head-filter";
import { Button } from "@/components/ui/button";
import { TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { TBaseModel, TTableState } from "@/schemas";

interface BaseTableHeadProps<TRow extends TBaseModel = TBaseModel> {
  table: Table<TBaseTableFeatures, TRow>;
  hasRows: boolean;
  thStyle?: (header: Header<TBaseTableFeatures, TRow>) => CSSProperties;
  onStateChange: (updater: React.SetStateAction<TTableState | undefined>) => void;
}

export default function BaseTableHead<TRow extends TBaseModel = TBaseModel>({
  table,
  hasRows,
  thStyle,
  onStateChange,
}: BaseTableHeadProps<TRow>) {
  // Until the first resize the table is capped to its container, which shrinks columns below their sizes, so the
  // rendered widths become the sizes before the drag starts from them
  const freezeRenderedSizes = (resizeHandle: HTMLElement) => {
    const cells = resizeHandle.closest("tr")?.cells;
    if (!cells || Object.keys(table.atoms.columnSizing.get()).length > 0) return;
    table.setColumnSizing(
      Object.fromEntries(
        table
          .getLeafHeaders()
          .map((header, i) => [header.column.id, cells.item(i)?.getBoundingClientRect().width ?? header.getSize()]),
      ),
    );
  };

  return (
    <TableHead className="sticky top-0 z-20 bg-background shadow-[0_1px_0_var(--color-border)]">
      {table.getHeaderGroups().map((headerGroup) => (
        <TableRow key={headerGroup.id}>
          {headerGroup.headers.map((header, i: number) => {
            const isLastColumn = i === headerGroup.headers.length - 1;
            const canBeResized = hasRows && header.column.getCanResize() && !isLastColumn;
            const canBeSorted = header.column.getCanSort();
            const canBeFiltered = header.column.getCanFilter() && header.column.columnDef.meta?.dataType !== undefined;
            return (
              <TableHeader key={header.id} style={thStyle?.(header)} canBeResized={canBeResized}>
                <div className="flex flex-col items-start gap-2 overflow-clip whitespace-nowrap [overflow-clip-margin:4px]">
                  <span className="font-semibold">
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </span>
                  {(canBeSorted || canBeFiltered) && (
                    <div className="flex w-full items-center gap-1">
                      {canBeSorted && (
                        <Button
                          testId={`button-sort-${String(header.column.id)}`}
                          className="shrink-0"
                          size="icon"
                          variant="secondary"
                          disabled={!hasRows}
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {(() => {
                            const sortState = header.column.getIsSorted();
                            if (sortState === "asc") return <ChevronUpIcon />;
                            if (sortState === "desc") return <ChevronDownIcon />;
                            return <ArrowDownWideNarrowIcon />;
                          })()}
                        </Button>
                      )}
                      {canBeFiltered && (
                        <TableHeadFilter
                          testId={`input-filter-${String(header.column.id)}`}
                          table={table}
                          header={header}
                          onStateChange={onStateChange}
                        />
                      )}
                    </div>
                  )}
                </div>
                {canBeResized && (
                  <Button
                    testId={`button-resize-${String(header.column.id)}`}
                    size="unstyled"
                    variant="secondary"
                    className="absolute top-1/2 right-0 z-10 flex h-[calc(100%-8px)] w-5 translate-x-1/2 -translate-y-1/2 transform cursor-col-resize items-center justify-center"
                    onDoubleClick={() => {
                      header.column.resetSize();
                    }}
                    onMouseDown={(event) => {
                      freezeRenderedSizes(event.currentTarget);
                      header.getResizeHandler()(event);
                    }}
                    onTouchStart={(event) => {
                      freezeRenderedSizes(event.currentTarget);
                      header.getResizeHandler()(event);
                    }}
                  >
                    <EllipsisVerticalIcon />
                  </Button>
                )}
              </TableHeader>
            );
          })}
        </TableRow>
      ))}
    </TableHead>
  );
}
