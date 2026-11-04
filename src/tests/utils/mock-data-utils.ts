import { dbGetProductionOrderStatus, getProductionOrders } from "@/db/functions/production-order";
import { getSellOrderLineStatus } from "@/db/functions/sell-order-line";
import { ProductionOrderStatus } from "@/schemas/production-order";
import type { TProductionOrderFilters } from "@/schemas/production-order";
import { SellOrderLineStatus } from "@/schemas/sell-order-line";
import {
  mockClients,
  mockDeliveryNoteLines,
  mockDeliveryNotes,
  mockPartReferences,
  mockParts,
  mockPartProduction,
  mockPaymentMethods,
  mockProductionOrders,
  mockSellOrderLines,
  mockSellOrders,
  mockTreatmentReceptions,
  mockTreatmentShipments,
} from "@/tests/mock-data";
import type { TBaseQueryProps } from "@/types";
import type { BaseClient } from "@/types/client";
import type { BaseDeliveryNote } from "@/types/delivery-note";
import type { BaseDeliveryNoteLine } from "@/types/delivery-note-line";
import type { BasePart } from "@/types/part";
import type { BasePartReference } from "@/types/part-reference";
import type { BasePaymentMethod } from "@/types/payment-method";
import type { BaseProductionOrder } from "@/types/production-order";
import type { BaseSellOrder } from "@/types/sell-order";
import type { BaseSellOrderLine } from "@/types/sell-order-line";

export function getMockClientById(clientId: number): BaseClient | undefined {
  return mockClients.find((c) => c.id === clientId);
}

export function getMockClientParts({
  clientId,
  includeDeleted = false,
  includePartReferenceNullClientId = false,
}: {
  clientId: number;
  includeDeleted?: boolean;
  includePartReferenceNullClientId?: boolean;
}): Array<BasePart> {
  const partIds = new Set(
    mockPartReferences
      .filter(
        (pr) =>
          (pr.clientId === clientId || (includePartReferenceNullClientId && pr.clientId === null)) &&
          (includeDeleted || !pr.deletedAt),
      )
      .map((pr) => pr.partId),
  );
  return mockParts.filter((part) => partIds.has(part.id) && (includeDeleted || !part.deletedAt));
}

export function getMockSellOrderLines(sellOrderId: number): Array<BaseSellOrderLine> {
  return mockSellOrderLines.filter((line) => line.sellOrderId === sellOrderId);
}

export function getMockPartReferenceById(partReferenceId: number | null): BasePartReference | undefined {
  return mockPartReferences.find((pr) => pr.id === partReferenceId);
}

export function getMockPaymentMethodById(paymentMethodId: number): BasePaymentMethod | undefined {
  return mockPaymentMethods.find((p) => p.id === paymentMethodId);
}

export function getMockSellOrderLineById(sellOrderLineId: number): BaseSellOrderLine | undefined {
  return mockSellOrderLines.find((sol) => sol.id === sellOrderLineId);
}

export function getMockDeliveryNoteById(deliveryNoteId: number): BaseDeliveryNote | undefined {
  return mockDeliveryNotes.find((dn) => dn.id === deliveryNoteId);
}

export function getMockSellOrderById(sellOrderId: number): BaseSellOrder | undefined {
  return mockSellOrders.find((so) => so.id === sellOrderId);
}

export function getMockPartReferences({
  partId,
  clientId,
  includeDeleted = false,
  includeNullClientId = false,
}: {
  partId?: number;
  clientId?: number;
  includeDeleted?: boolean;
  includeNullClientId?: boolean;
}): Array<BasePartReference> {
  return mockPartReferences.filter((pr) => {
    const matchesPartId = partId !== undefined ? pr.partId === partId : true;
    const matchesClientId =
      (clientId === undefined && !includeNullClientId) ||
      (clientId !== undefined && pr.clientId === clientId) ||
      (includeNullClientId && pr.clientId === null);
    const matchesDeletion = includeDeleted || !pr.deletedAt;
    return matchesPartId && matchesClientId && matchesDeletion;
  });
}

export async function getMockPendingSellOrderLines(clientId?: number): Promise<Array<BaseSellOrderLine>> {
  const possibleStatuses = [
    SellOrderLineStatus.InProduction,
    SellOrderLineStatus.InTreatment,
    SellOrderLineStatus.PendingTreatment,
    SellOrderLineStatus.ProductionFinished,
    SellOrderLineStatus.ProductionPending,
    SellOrderLineStatus.Pending,
  ];

  const filteredByClient =
    clientId === undefined
      ? mockSellOrderLines
      : mockSellOrderLines.filter((line) => getMockSellOrderById(line.sellOrderId)?.clientId === clientId);

  const statusChecks = await Promise.all(
    filteredByClient.map(async (sellOrderLine) => ({
      hasValidStatus: possibleStatuses.includes(await getSellOrderLineStatus({ sellOrderLine })),
      sellOrderLine,
    })),
  );

  return statusChecks.filter(({ hasValidStatus }) => hasValidStatus).map(({ sellOrderLine }) => sellOrderLine);
}

export function getMockPartByPartReferenceId(partReferenceId: number | null): BasePart | undefined {
  const partReference = getMockPartReferenceById(partReferenceId);
  if (!partReference) {
    return undefined;
  }
  return mockParts.find((part) => part.id === partReference.partId);
}

export function getMockDeliveryNoteLines(deliveryNoteId: number): Array<BaseDeliveryNoteLine> {
  return mockDeliveryNoteLines.filter((line) => line.deliveryNoteId === deliveryNoteId);
}

export function getMockDeliveryNotesOfPart(partId: number): Array<BaseDeliveryNote> {
  const partReferenceIds = getMockPartReferences({ partId }).map((partReference) => partReference.id);
  return mockDeliveryNotes.filter((deliveryNote) =>
    getMockDeliveryNoteLines(deliveryNote.id).some(
      (deliveryNoteLine) =>
        deliveryNoteLine.partReferenceId !== null && partReferenceIds.includes(deliveryNoteLine.partReferenceId),
    ),
  );
}

export function getMockSellOrdersOfPart(partId: number): Array<BaseSellOrder> {
  return mockSellOrders.filter((sellOrder) =>
    getMockSellOrderLines(sellOrder.id).some(
      (sellOrderLine) => getMockPartReferenceById(sellOrderLine.partReferenceId)?.partId === partId,
    ),
  );
}

export async function getProductionOrdersByStatuses(
  statuses: Array<ProductionOrderStatus>,
  query?: TBaseQueryProps<TProductionOrderFilters>,
): Promise<Array<BaseProductionOrder>> {
  const productionOrders = await getProductionOrders(query);
  const productionOrderStatuses = await Promise.all(
    productionOrders.map(async (productionOrder) => dbGetProductionOrderStatus(productionOrder)),
  );
  return productionOrders.filter((_, index) => statuses.includes(productionOrderStatuses[index]));
}

function getMockProductionOrdersWithoutQuantity(started: boolean): Array<BaseProductionOrder> {
  const productionOrders = mockProductionOrders.filter(
    (mockProductionOrder) =>
      mockProductionOrder.quantity === null &&
      mockProductionOrder.deletedAt === null &&
      mockPartProduction.some((partProduction) => partProduction.productionOrderId === mockProductionOrder.id) ===
        started,
  );
  if (productionOrders.length === 0) {
    throw new Error(
      `Wrong test set up: Some Orden de producción without quantity should ${started ? "have produced" : "not be started"}`,
    );
  }
  return productionOrders;
}

export function getMockUnstartedProductionOrdersWithoutQuantity(): Array<BaseProductionOrder> {
  return getMockProductionOrdersWithoutQuantity(false);
}

export function getMockStartedProductionOrdersWithoutQuantity(): Array<BaseProductionOrder> {
  return getMockProductionOrdersWithoutQuantity(true);
}

export function getMockTreatmentQuantities(productionOrderId: number) {
  const treatmentShipments = mockTreatmentShipments.filter(
    (treatmentShipment) => treatmentShipment.productionOrderId === productionOrderId,
  );
  return {
    receivedQuantity: mockTreatmentReceptions
      .filter((treatmentReception) =>
        treatmentShipments.some((treatmentShipment) => treatmentShipment.id === treatmentReception.treatmentShipmentId),
      )
      .reduce((total, treatmentReception) => total + treatmentReception.quantity, 0),
    sentQuantity: treatmentShipments.reduce((total, treatmentShipment) => total + treatmentShipment.quantity, 0),
  };
}

// The status of a production order once its machines finish it, having produced more than the mock data sent to the
// treatment
export function getMockProducedProductionOrderStatus(productionOrderId: number): ProductionOrderStatus {
  const productionOrder = mockProductionOrders.find(({ id }) => id === productionOrderId)!;
  if (mockParts.find((part) => part.id === productionOrder.partId)?.coatingId == null) {
    return ProductionOrderStatus.Completed;
  }
  const { sentQuantity, receivedQuantity } = getMockTreatmentQuantities(productionOrderId);
  return sentQuantity > receivedQuantity ? ProductionOrderStatus.InTreatment : ProductionOrderStatus.PendingTreatment;
}
