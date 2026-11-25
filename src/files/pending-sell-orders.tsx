import { Fragment } from "react";

import ResanoLogo from "@/components/images/ResanoLogo";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { renderPdf, WRAPPING_CELL_CLASS_NAME } from "@/files";
import { getSellOrderLineStatusDisplay } from "@/lib/sell-order-line";
import { cn } from "@/lib/utils";
import { DESCRIPTION_LABEL, PART_LABEL, PENDING_LABEL, QUANTITY_LABEL, STATUS_LABEL } from "@/messages/common";
import {
  DELIVERY_LABEL,
  MANUFACTURE_LABEL,
  PENDING_SELL_ORDERS_TITLE,
  PREPARED_LABEL,
  SELL_ORDER_LABEL,
  SELL_ORDER_NOTES_LABEL,
} from "@/messages/sell-order";
import type { SellOrderLineStatus } from "@/schemas/sell-order-line";

interface TPendingSellOrdersDocumentLine {
  id: number;
  sellOrderReference: string;
  status: SellOrderLineStatus;
  reference: string | null;
  description: string | null;
  quantity: number;
  pendingQuantity: number;
  requestedDeliveryDate: string | null;
  notes: string | null;
}

interface PendingSellOrdersDocumentProps {
  clientName: string;
  date: string;
  lines: Array<TPendingSellOrdersDocumentLine>;
  withCheckboxes: boolean;
}

function EmptyCheckbox() {
  return <span className="mx-auto block size-3 rounded-sm border border-black" />;
}

function PendingSellOrdersDocument({ clientName, date, lines, withCheckboxes }: PendingSellOrdersDocumentProps) {
  return (
    <div className="flex flex-col gap-2 p-1">
      <div className="flex flex-row items-center justify-between gap-4">
        <ResanoLogo className="h-8" />
        <div className="flex flex-1 flex-col items-center gap-0.5 text-center">
          <span className="text-xl font-bold tracking-wider uppercase">{PENDING_SELL_ORDERS_TITLE}</span>
          <span className="text-lg font-bold">{clientName}</span>
        </div>
        <span className="text-sm">{date}</span>
      </div>
      <Table
        className="overflow-visible rounded-none border-0 text-sm"
        tableClassName="border-collapse border border-border [&_td]:border [&_td]:border-border [&_th]:border-y [&_th]:border-border [&_th]:align-middle [&_td]:p-1 [&_th]:p-1 [&_td]:leading-tight"
      >
        <TableHead className="table-header-group">
          <TableRow variant="plain">
            <TableHeader className="w-px text-center">#</TableHeader>
            <TableHeader>{SELL_ORDER_LABEL}</TableHeader>
            <TableHeader className="w-px">{STATUS_LABEL}</TableHeader>
            <TableHeader>{PART_LABEL}</TableHeader>
            <TableHeader>{DESCRIPTION_LABEL}</TableHeader>
            <TableHeader className="text-right">{QUANTITY_LABEL}</TableHeader>
            <TableHeader className="text-right">{PENDING_LABEL}</TableHeader>
            <TableHeader className="w-px">{DELIVERY_LABEL}</TableHeader>
            {withCheckboxes && (
              <>
                <TableHeader className="w-px text-center text-xs">{PREPARED_LABEL}</TableHeader>
                <TableHeader className="w-px text-center text-xs">{MANUFACTURE_LABEL}</TableHeader>
              </>
            )}
          </TableRow>
        </TableHead>
        <TableBody>
          {lines.map((line, index) => {
            const hasNotes = line.notes !== null && line.notes !== "";
            const { statusText, statusClassName } = getSellOrderLineStatusDisplay(line.status);
            return (
              <Fragment key={line.id}>
                <TableRow
                  compact
                  variant="plain"
                  style={{ breakAfter: hasNotes ? "avoid" : undefined, breakInside: "avoid" }}
                >
                  <TableCell className="w-px text-right text-xs">{index + 1}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{line.sellOrderReference}</TableCell>
                  <TableCell className={cn("w-px", statusClassName)}>{statusText}</TableCell>
                  <TableCell className="font-bold">{line.reference ?? ""}</TableCell>
                  <TableCell className={cn(WRAPPING_CELL_CLASS_NAME, "text-xs")}>{line.description ?? ""}</TableCell>
                  <TableCell className="w-px text-right">{line.quantity}</TableCell>
                  <TableCell className="w-px text-right">{line.pendingQuantity}</TableCell>
                  <TableCell className="w-px">{line.requestedDeliveryDate ?? ""}</TableCell>
                  {withCheckboxes && (
                    <>
                      <TableCell>
                        <EmptyCheckbox />
                      </TableCell>
                      <TableCell>
                        <EmptyCheckbox />
                      </TableCell>
                    </>
                  )}
                </TableRow>
                {hasNotes && (
                  <TableRow compact rowType="subrow" variant="plain" style={{ breakInside: "avoid" }}>
                    <TableCell />
                    <TableCell colSpan={withCheckboxes ? 9 : 7} className={WRAPPING_CELL_CLASS_NAME}>
                      <span className="font-semibold">{SELL_ORDER_NOTES_LABEL}</span> {line.notes}
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

interface RenderPendingSellOrdersProps extends PendingSellOrdersDocumentProps {
  path?: string;
  saveHtml?: boolean;
}

export async function renderPendingSellOrders({ path, saveHtml, ...props }: RenderPendingSellOrdersProps) {
  return renderPdf({
    document: <PendingSellOrdersDocument {...props} />,
    path,
    margin: "0.8cm",
    format: "A4",
    landscape: true,
    saveHtml,
  });
}
