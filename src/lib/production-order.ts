import { ProductionOrderStatus } from "@/schemas/production-order";

export interface TProductionOrderStatusInput {
  deletedAt: Date | null;
  quantity: number | null;
  sellOrderLine?: { deletedAt: Date | null; sellOrder?: { deletedAt: Date | null } | null } | null;
  producedQuantity: number;
  isActiveOnMachine: boolean;
  needsTreatment: boolean;
  sentQuantity: number;
  receivedQuantity: number;
}

const PRODUCTION_FINISHED_STATUSES = [
  ProductionOrderStatus.PendingTreatment,
  ProductionOrderStatus.InTreatment,
  ProductionOrderStatus.Completed,
];

export function isProductionFinished(status: ProductionOrderStatus): boolean {
  return PRODUCTION_FINISHED_STATUSES.includes(status);
}

export function computeProductionOrderStatus(productionOrder: TProductionOrderStatusInput): ProductionOrderStatus {
  if (productionOrder.deletedAt !== null) {
    return ProductionOrderStatus.Deleted;
  }
  if (productionOrder.sellOrderLine?.deletedAt != null) {
    return ProductionOrderStatus.SellOrderLineDeleted;
  }
  if (productionOrder.sellOrderLine?.sellOrder?.deletedAt != null) {
    return ProductionOrderStatus.SellOrderDeleted;
  }

  const { producedQuantity, quantity, isActiveOnMachine } = productionOrder;
  // Without a quantity there is no target to reach, so it is done once a machine finishes it having produced something
  const isProduced = quantity !== null ? producedQuantity >= quantity : producedQuantity > 0 && !isActiveOnMachine;
  if (!isProduced) {
    return isActiveOnMachine ? ProductionOrderStatus.InProduction : ProductionOrderStatus.Pending;
  }

  if (productionOrder.needsTreatment) {
    if (productionOrder.sentQuantity > productionOrder.receivedQuantity) {
      return ProductionOrderStatus.InTreatment;
    }
    if (producedQuantity > productionOrder.sentQuantity) {
      return ProductionOrderStatus.PendingTreatment;
    }
  }
  return ProductionOrderStatus.Completed;
}

// Producing more than asked leaves nothing pending, and without a quantity there is nothing to count down
export function getProductionOrderPendingQuantity(quantity: number | null, producedQuantity: number | undefined) {
  return quantity === null ? null : Math.max(quantity - (producedQuantity ?? 0), 0);
}

export const DEFAULT_QUALITY_CONTROL_MIN_QUANTITY = 500;

export const hasDefaultQualityControl = (quantity: unknown) =>
  typeof quantity === "number" && quantity >= DEFAULT_QUALITY_CONTROL_MIN_QUANTITY;
