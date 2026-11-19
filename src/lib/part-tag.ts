import { formatPartUnits } from "@/lib/formatters";
import { CLIENT_LABEL } from "@/messages/common";

// What a part tag is printed for, which names its file, so the server writes it and the browser asks for it by the
// same name
export enum PartTagSource {
  DeliveryNoteLine = "delivery-note-line",
  SellOrderLine = "sell-order-line",
  ProductionOrder = "production-order",
}

export const PART_TAG_NAME_PATTERN = new RegExp(`^(${Object.values(PartTagSource).join("|")})-\\d+$`);

export function getPartTagName(source: PartTagSource, id: number) {
  return `${source}-${id}`;
}

// The file is overwritten on every print, so the URL carries the time to keep the browser from reusing an older one
export function getPartTagFileUrl(tagName: string) {
  return `/api/files/part-tag/${tagName}?generatedAt=${Date.now()}`;
}

export interface TTagSellOrder {
  reference: string;
  requestedDeliveryDate: Date | null;
  quantity: number;
}

export function getTagSellOrder(
  sellOrder: { id: number; clientReference: string | null },
  requestedDeliveryDate: Date | null,
  quantity: number,
): TTagSellOrder {
  return { quantity, reference: sellOrder.clientReference ?? String(sellOrder.id), requestedDeliveryDate };
}

// The tags take their units from the Pedidos in order, so a box holds the earliest Pedidos first, and the last Pedido
// takes the units beyond the quantities given
export function allocateTagSellOrders(partQuantities: Array<number>, sellOrders: Array<TTagSellOrder>) {
  const remaining = sellOrders.map((sellOrder) => sellOrder.quantity);
  let index = 0;
  return partQuantities.map((partQuantity) => {
    const tagSellOrders: Array<TTagSellOrder> = [];
    let unallocated = partQuantity;
    while (unallocated > 0 && index < sellOrders.length) {
      const isLast = index === sellOrders.length - 1;
      const taken = isLast ? unallocated : Math.min(unallocated, Math.max(remaining[index], 0));
      // The lines of the same Pedido share one entry on the tag
      const entry = tagSellOrders.find((tagSellOrder) => tagSellOrder.reference === sellOrders[index].reference);
      if (taken > 0 && entry) entry.quantity += taken;
      else if (taken > 0) tagSellOrders.push({ ...sellOrders[index], quantity: taken });
      remaining[index] -= taken;
      unallocated -= taken;
      if (!isLast && remaining[index] <= 0) index++;
    }
    return tagSellOrders;
  });
}

export function getTagClientText(clientName: string) {
  return `${CLIENT_LABEL}: ${clientName}`;
}

// From this many Pedidos the rows of a tag have no room left for the word "unidades" next to their quantity
export const TAG_BARE_QUANTITY_MIN_SELL_ORDERS = 3;

export function getTagSellOrderQuantityText(quantity: number, sellOrderCount: number) {
  return sellOrderCount < TAG_BARE_QUANTITY_MIN_SELL_ORDERS ? formatPartUnits(quantity) : String(quantity);
}
