import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import { memo, useCallback, useLayoutEffect, useState } from "react";

import { TABLE_ROW_HEIGHT_PX } from "@/components/table/row-height";

type TMeasureElement = (element: HTMLTableRowElement | null) => void;
type TVirtualizedRow = { id: string; getIsExpanded: () => boolean };

interface VirtualizedRowsProps<TRow extends TVirtualizedRow> {
  rows: Array<TRow>;
  tbodyRef: React.RefObject<HTMLTableSectionElement | null>;
  renderRow: (row: TRow, rowIndex: number, measureElement: TMeasureElement) => React.ReactElement;
}

interface VirtualizedRowProps<TRow extends TVirtualizedRow> extends Pick<VirtualizedRowsProps<TRow>, "renderRow"> {
  row: TRow;
  rowIndex: number;
  measureElement: TMeasureElement;
  // Expanding keeps the same row object, so the memo needs the state that renderRow reads from the table
  isExpanded: boolean;
}

// Memoized by hand, because the React Compiler does not memoize the result of calling a prop, so that scrolling only
// renders the rows that come into view instead of every rendered row
const VirtualizedRow = memo(function VirtualizedRow<TRow extends TVirtualizedRow>({
  row,
  rowIndex,
  measureElement,
  renderRow,
}: VirtualizedRowProps<TRow>) {
  return renderRow(row, rowIndex, measureElement);
}) as <TRow extends TVirtualizedRow>(props: VirtualizedRowProps<TRow>) => React.ReactElement;

// The table scrolls its own rows only while it has a max height, otherwise they scroll with the scroll container around
// it. Picked by style rather than by overflow, which flips for a frame whenever the rendered rows change
const getScrollElement = (tableScroller: HTMLElement | null | undefined) => {
  if (!tableScroller || getComputedStyle(tableScroller).maxHeight !== "none") return tableScroller ?? null;
  let ancestor = tableScroller.parentElement;
  while (ancestor !== null && !["auto", "scroll"].includes(getComputedStyle(ancestor).overflowY)) {
    ancestor = ancestor.parentElement;
  }
  return ancestor ?? (document.scrollingElement instanceof HTMLElement ? document.scrollingElement : null);
};

// Kept apart from BaseTable because the React Compiler skips memoizing any component that calls useVirtualizer
export default function VirtualizedRows<TRow extends TVirtualizedRow>({
  rows,
  tbodyRef,
  renderRow,
}: VirtualizedRowsProps<TRow>) {
  const [scrollMargin, setScrollMargin] = useState(0);
  // oxlint-disable-next-line react/incompatible-library
  const rowVirtualizer = useVirtualizer<HTMLElement, HTMLTableRowElement>({
    count: rows.length,
    getScrollElement: () => getScrollElement(tbodyRef.current?.closest("table")?.parentElement),
    estimateSize: () => TABLE_ROW_HEIGHT_PX,
    overscan: 10,
    scrollMargin,
    getItemKey: useCallback((index: number) => rows[index]?.id ?? index, [rows]),
    // Starts on an even row so that the striping of the odd rows does not flip while scrolling
    rangeExtractor: (range) =>
      defaultRangeExtractor({
        ...range,
        startIndex: range.startIndex - (Math.max(range.startIndex - range.overscan, 0) % 2),
      }),
    // An expanded row is measured along with its subrow, because both scroll as a single item
    measureElement: (element) => {
      const nextElement = element.nextElementSibling;
      return (
        element.getBoundingClientRect().height +
        (nextElement instanceof HTMLElement && nextElement.dataset.rowType === "subrow"
          ? nextElement.getBoundingClientRect().height
          : 0)
      );
    },
  });

  useLayoutEffect(() => {
    const scrollElement = rowVirtualizer.scrollElement;
    const tbodyElement = tbodyRef.current;
    if (scrollElement === null || tbodyElement === null) return;
    setScrollMargin(
      tbodyElement.getBoundingClientRect().top - scrollElement.getBoundingClientRect().top + scrollElement.scrollTop,
    );
    // Subrows are not observed by the virtualizer, so they get remeasured when they expand or load their content
    const resizeObserver = new ResizeObserver(() =>
      tbodyElement
        .querySelectorAll<HTMLTableRowElement>(":scope > tr[data-index]")
        .forEach(rowVirtualizer.measureElement),
    );
    resizeObserver.observe(tbodyElement);
    return () => resizeObserver.disconnect();
  }, [tbodyRef, rowVirtualizer, rowVirtualizer.scrollElement]);

  const virtualRows = rowVirtualizer.getVirtualItems();
  const paddingTop = (virtualRows[0]?.start ?? scrollMargin) - scrollMargin;
  const paddingBottom = rowVirtualizer.getTotalSize() - ((virtualRows.at(-1)?.end ?? scrollMargin) - scrollMargin);

  return (
    <>
      {paddingTop > 0 && (
        <tr aria-hidden>
          <td style={{ height: paddingTop }} />
        </tr>
      )}
      {virtualRows.map((virtualRow) => (
        <VirtualizedRow
          key={rows[virtualRow.index].id}
          row={rows[virtualRow.index]}
          rowIndex={virtualRow.index}
          measureElement={rowVirtualizer.measureElement}
          isExpanded={rows[virtualRow.index].getIsExpanded()}
          renderRow={renderRow}
        />
      ))}
      {paddingBottom > 0 && (
        <tr aria-hidden>
          <td style={{ height: paddingBottom }} />
        </tr>
      )}
    </>
  );
}
