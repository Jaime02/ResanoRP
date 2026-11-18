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
