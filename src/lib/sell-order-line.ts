import { STATUS_DELETED_LABEL, STATUS_PENDING_LABEL, STATUS_COMPLETED_LABEL } from "@/messages/common";
import {
  SELL_ORDER_LINE_COMPLETED_TOOLTIP_MESSAGE,
  SELL_ORDER_LINE_IN_PRODUCTION_LABEL,
  SELL_ORDER_LINE_IN_PRODUCTION_TOOLTIP_MESSAGE,
  SELL_ORDER_LINE_IN_TREATMENT_LABEL,
  SELL_ORDER_LINE_IN_TREATMENT_TOOLTIP_MESSAGE,
  SELL_ORDER_LINE_ORDER_DELETED_LABEL,
  SELL_ORDER_LINE_ORDER_DELETED_TOOLTIP_MESSAGE,
  SELL_ORDER_LINE_PENDING_PRODUCTION_TOOLTIP_MESSAGE,
  SELL_ORDER_LINE_PENDING_SHIPMENT_TOOLTIP_MESSAGE,
  SELL_ORDER_LINE_PENDING_TREATMENT_LABEL,
  SELL_ORDER_LINE_PENDING_TREATMENT_TOOLTIP_MESSAGE,
  SELL_ORDER_LINE_PRODUCTION_FINISHED_LABEL,
  SELL_ORDER_LINE_SHIPPED_TOOLTIP_MESSAGE,
} from "@/messages/sell-order";
import { ProductionOrderStatus } from "@/schemas/production-order";
import { SellOrderLineStatus } from "@/schemas/sell-order-line";

// A return has a negative quantity, so what is left of it to deliver goes from its quantity up to 0
export function clampPendingQuantity(pendingQuantity: number, quantity: number): number {
  return Math.min(Math.max(pendingQuantity, Math.min(quantity, 0)), Math.max(quantity, 0));
}

interface TSortablePendingSellOrderLine {
  id: number;
  requestedDeliveryDate: Date | null;
  partReference?: { part?: { id: number } | null } | null;
}

function getSellOrderLineGroupKey(line: TSortablePendingSellOrderLine) {
  return line.partReference?.part ? `part-${line.partReference.part.id}` : `line-${line.id}`;
}

// Fills the lines in order up to what is pending of each, and the last one takes the rest
export function splitQuantityFifo(lines: Array<{ id: number; pendingQuantity: number }>, total: number) {
  let remaining = total;
  return lines.map((line, index) => {
    const quantity =
      index === lines.length - 1
        ? remaining
        : Math.sign(remaining) * Math.min(Math.abs(remaining), Math.abs(line.pendingQuantity));
    remaining -= quantity;
    return { id: line.id, quantity };
  });
}

// The pending lines come sorted by delivery date, so the lines of each group keep the order they are served in, and the
// group is identified by its earliest line. A return is grouped apart, so it never cancels out a delivery of the part
export function groupStagedSellOrderLines<
  TLine extends TSortablePendingSellOrderLine & { pendingQuantity: number; quantity: number },
>(pendingLines: Array<TLine> | undefined, stagedLines: Array<{ id: number; quantity: number }> | undefined) {
  const groups = new Map<string, Array<TLine>>();
  for (const line of pendingLines ?? []) {
    const stagedLine = stagedLines?.find((staged) => staged.id === line.id);
    if (stagedLine === undefined) continue;
    const key = `${getSellOrderLineGroupKey(line)}${line.pendingQuantity < 0 ? "-return" : ""}`;
    groups.set(key, [...(groups.get(key) ?? []), { ...line, quantity: stagedLine.quantity }]);
  }
  return [...groups.values()].map((lines) => ({
    id: lines[0].id,
    lines,
    quantity: lines.reduce((total, line) => total + line.quantity, 0),
  }));
}

export function sortPendingSellOrderLines<TLine extends TSortablePendingSellOrderLine>(lines: Array<TLine>) {
  const time = (line: TLine) => line.requestedDeliveryDate?.getTime() ?? Infinity;

  const groupFirstTime = new Map<string, number>();
  for (const line of lines) {
    const key = getSellOrderLineGroupKey(line);
    groupFirstTime.set(key, Math.min(groupFirstTime.get(key) ?? Infinity, time(line)));
  }

  return [...lines].sort(
    (a, b) =>
      (groupFirstTime.get(getSellOrderLineGroupKey(a)) ?? Infinity) -
        (groupFirstTime.get(getSellOrderLineGroupKey(b)) ?? Infinity) ||
      getSellOrderLineGroupKey(a).localeCompare(getSellOrderLineGroupKey(b)) ||
      time(a) - time(b) ||
      a.id - b.id,
  );
}

// The production comes first, and the parts out in the treatment before the ones still to send, like the status of
// a single Orden de producción. The deleted Órdenes de producción are left out, they do not count for the Línea
const SELL_ORDER_LINE_STATUS_BY_PRODUCTION_ORDER_STATUS_PRIORITY = [
  [ProductionOrderStatus.InProduction, SellOrderLineStatus.InProduction],
  [ProductionOrderStatus.Pending, SellOrderLineStatus.ProductionPending],
  [ProductionOrderStatus.InTreatment, SellOrderLineStatus.InTreatment],
  [ProductionOrderStatus.PendingTreatment, SellOrderLineStatus.PendingTreatment],
  [ProductionOrderStatus.Completed, SellOrderLineStatus.ProductionFinished],
] as const;

export function computeSellOrderLineStatus({
  sellOrderLine,
  sellOrder,
  productionOrderStatuses,
}: {
  sellOrderLine: { deletedAt: Date | null; pendingQuantity: number };
  sellOrder: { deletedAt: Date | null };
  productionOrderStatuses: Array<ProductionOrderStatus>;
}): SellOrderLineStatus {
  if (sellOrderLine.deletedAt !== null) {
    return SellOrderLineStatus.Deleted;
  }
  if (sellOrder.deletedAt !== null) {
    return SellOrderLineStatus.SellOrderDeleted;
  }
  if (sellOrderLine.pendingQuantity === 0) {
    return SellOrderLineStatus.Completed;
  }
  return (
    SELL_ORDER_LINE_STATUS_BY_PRODUCTION_ORDER_STATUS_PRIORITY.find(([productionOrderStatus]) =>
      productionOrderStatuses.includes(productionOrderStatus),
    )?.[1] ?? SellOrderLineStatus.Pending
  );
}

export function getSellOrderLineStatusDisplay(status: SellOrderLineStatus): {
  statusText: string;
  statusClassName: string;
  tooltipDescription: string | null;
} {
  if (status === SellOrderLineStatus.Pending) {
    return {
      statusText: STATUS_PENDING_LABEL,
      statusClassName: "text-status-warning",
      tooltipDescription: SELL_ORDER_LINE_PENDING_SHIPMENT_TOOLTIP_MESSAGE,
    };
  }
  if (status === SellOrderLineStatus.ProductionPending) {
    return {
      statusText: STATUS_PENDING_LABEL,
      statusClassName: "text-status-warning",
      tooltipDescription: SELL_ORDER_LINE_PENDING_PRODUCTION_TOOLTIP_MESSAGE,
    };
  }
  if (status === SellOrderLineStatus.InProduction) {
    return {
      statusText: SELL_ORDER_LINE_IN_PRODUCTION_LABEL,
      statusClassName: "text-primary",
      tooltipDescription: SELL_ORDER_LINE_IN_PRODUCTION_TOOLTIP_MESSAGE,
    };
  }
  if (status === SellOrderLineStatus.PendingTreatment) {
    return {
      statusText: SELL_ORDER_LINE_PENDING_TREATMENT_LABEL,
      statusClassName: "text-status-warning",
      tooltipDescription: SELL_ORDER_LINE_PENDING_TREATMENT_TOOLTIP_MESSAGE,
    };
  }
  if (status === SellOrderLineStatus.InTreatment) {
    return {
      statusText: SELL_ORDER_LINE_IN_TREATMENT_LABEL,
      statusClassName: "text-primary",
      tooltipDescription: SELL_ORDER_LINE_IN_TREATMENT_TOOLTIP_MESSAGE,
    };
  }
  if (status === SellOrderLineStatus.ProductionFinished) {
    return {
      statusText: SELL_ORDER_LINE_PRODUCTION_FINISHED_LABEL,
      statusClassName: "text-success",
      tooltipDescription: SELL_ORDER_LINE_COMPLETED_TOOLTIP_MESSAGE,
    };
  }
  if (status === SellOrderLineStatus.Completed) {
    return {
      statusText: STATUS_COMPLETED_LABEL,
      statusClassName: "text-success",
      tooltipDescription: SELL_ORDER_LINE_SHIPPED_TOOLTIP_MESSAGE,
    };
  }
  if (status === SellOrderLineStatus.SellOrderDeleted) {
    return {
      statusText: SELL_ORDER_LINE_ORDER_DELETED_LABEL,
      statusClassName: "text-status-error",
      tooltipDescription: SELL_ORDER_LINE_ORDER_DELETED_TOOLTIP_MESSAGE,
    };
  }
  return { statusText: STATUS_DELETED_LABEL, statusClassName: "text-status-error", tooltipDescription: null };
}
