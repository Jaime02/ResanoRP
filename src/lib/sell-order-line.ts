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

export function sortPendingSellOrderLines<TLine extends TSortablePendingSellOrderLine>(lines: Array<TLine>) {
  const groupKey = (line: TLine) =>
    line.partReference?.part ? `part-${line.partReference.part.id}` : `line-${line.id}`;
  const time = (line: TLine) => line.requestedDeliveryDate?.getTime() ?? Infinity;

  const groupFirstTime = new Map<string, number>();
  for (const line of lines) {
    const key = groupKey(line);
    groupFirstTime.set(key, Math.min(groupFirstTime.get(key) ?? Infinity, time(line)));
  }

  return [...lines].sort(
    (a, b) =>
      (groupFirstTime.get(groupKey(a)) ?? Infinity) - (groupFirstTime.get(groupKey(b)) ?? Infinity) ||
      groupKey(a).localeCompare(groupKey(b)) ||
      time(a) - time(b),
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
