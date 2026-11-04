import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useLayoutEffect, useState } from "react";

type TMeasureElement = (element: HTMLTableRowElement | null) => void;

interface VirtualizedRowsProps<TRow extends { id: string }> {
  rows: Array<TRow>;
  tbodyRef: React.RefObject<HTMLTableSectionElement | null>;
  renderRow: (row: TRow, rowIndex: number, measureElement: TMeasureElement) => React.ReactElement;
}

// Kept apart from BaseTable because the React Compiler skips memoizing any component that calls useVirtualizer
export default function VirtualizedRows<TRow extends { id: string }>({
  rows,
  tbodyRef,
  renderRow,
}: VirtualizedRowsProps<TRow>) {
  const [scrollMargin, setScrollMargin] = useState(0);
  // oxlint-disable-next-line react/incompatible-library
  const rowVirtualizer = useVirtualizer<HTMLElement, HTMLTableRowElement>({
    count: rows.length,
    // The page scrolls inside the #main element of the root layout, not the window
    getScrollElement: () => document.getElementById("main"),
    estimateSize: () => 57,
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
    const mainElement = document.getElementById("main");
    const tbodyElement = tbodyRef.current;
    if (mainElement === null || tbodyElement === null) return;
    setScrollMargin(
      tbodyElement.getBoundingClientRect().top - mainElement.getBoundingClientRect().top + mainElement.scrollTop,
    );
    // Subrows are not observed by the virtualizer, so they get remeasured when they expand or load their content
    const resizeObserver = new ResizeObserver(() =>
      tbodyElement
        .querySelectorAll<HTMLTableRowElement>(":scope > tr[data-index]")
        .forEach(rowVirtualizer.measureElement),
    );
    resizeObserver.observe(tbodyElement);
    return () => resizeObserver.disconnect();
  }, [tbodyRef, rowVirtualizer]);

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
      {virtualRows.map((virtualRow) =>
        renderRow(rows[virtualRow.index], virtualRow.index, rowVirtualizer.measureElement),
      )}
      {paddingBottom > 0 && (
        <tr aria-hidden>
          <td style={{ height: paddingBottom }} />
        </tr>
      )}
    </>
  );
}
