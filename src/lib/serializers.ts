import type { TSellOrderForm, TSellOrderLineForm } from "@/form/hooks/use-sell-order";
import { formatDate, formatPrice, formatPricePerKilo } from "@/lib/formatters";
import { formatCents } from "@/lib/prices";
import { BLUEPRINT_CREATION_DATE_LABEL } from "@/messages/blueprint";
import { INVOICE_EMAIL_LABEL } from "@/messages/client";
import {
  CLIENT_LABEL,
  DATE_LABEL,
  DESCRIPTION_LABEL,
  LEGAL_NAME_LABEL,
  NAME_LABEL,
  NOTES_LABEL,
  NUMBER_LABEL,
  PARTS_LABEL,
  PART_LABEL,
  PAYMENT_METHOD_LABEL,
  PRICE_LABEL,
  QUANTITY_LABEL,
  REFERENCE_LABEL,
  SHAPE_LABEL,
  SIZE_LABEL,
  TOTAL_LABEL,
} from "@/messages/common";
import { DELIVERY_NOTES_LABEL } from "@/messages/delivery-note";
import { DUE_DATE_LABEL } from "@/messages/invoice";
import { MACHINE_MAX_DIAMETER_LABEL, MACHINE_MIN_DIAMETER_LABEL } from "@/messages/machine";
import { RAW_MATERIAL_DENSITY_LABEL, RAW_MATERIAL_LABEL } from "@/messages/material";
import { PART_FEATURE_LABEL, CLIENT_DESCRIPTION_LABEL, CLIENT_REFERENCE_DESCRIPTION_LABEL } from "@/messages/part";
import { BASE_LABEL, PENDING_PRICE_LABEL } from "@/messages/part-price";
import { QUANTITY_TO_PRODUCE_LABEL } from "@/messages/production-order";
import {
  CLIENT_REFERENCE_COLUMN_LABEL,
  RECEPTION_DATE_LABEL,
  REQUESTED_DELIVERY_DATE_LABEL,
  SELL_ORDER_LABEL,
} from "@/messages/sell-order";
import type { TDeliveryNoteLine } from "@/queries/delivery-note";
import type { TClientBlueprint } from "@/queries/part";

declare const serialized: unique symbol;

export type TSerializeOutput = Record<string, string | null | undefined> & { readonly [serialized]: true };

function serialize(output: Record<string, string | null | undefined>) {
  return output as TSerializeOutput;
}

function formatSellOrderReference(sellOrder: { id: number; clientReference: string | null } | null | undefined) {
  return sellOrder?.clientReference ?? (sellOrder?.id !== undefined ? String(sellOrder.id) : null);
}

export function serializeDeliveryNoteLine(deliveryNoteLine: TDeliveryNoteLine): TSerializeOutput {
  return serialize({
    [QUANTITY_LABEL]: String(deliveryNoteLine.quantity),
    [DESCRIPTION_LABEL]: deliveryNoteLine.partReference?.part?.description ?? null,
    [CLIENT_DESCRIPTION_LABEL]: deliveryNoteLine.partReference?.clientDescription ?? null,
    [SELL_ORDER_LABEL]: formatSellOrderReference(deliveryNoteLine.sellOrderLine?.sellOrder),
    [REFERENCE_LABEL]: deliveryNoteLine.partReference?.reference ?? null,
  });
}

export function serializeDeliveryNote(deliveryNote: {
  id: number;
  client?: { name: string } | null;
  deliveryDate: string | Date | null;
  deliveryNoteLines: Array<unknown>;
}): TSerializeOutput {
  return serialize({
    [NUMBER_LABEL]: String(deliveryNote.id),
    [CLIENT_LABEL]: deliveryNote.client?.name,
    [DATE_LABEL]: formatDate(deliveryNote.deliveryDate),
    [PARTS_LABEL]: String(deliveryNote.deliveryNoteLines.length),
  });
}

export function serializeInvoice(invoice: {
  id: number;
  client?: { name: string } | null;
  createdAt: string | Date;
  dueDate: string | Date;
  deliveryNotes: Array<unknown>;
  taxableBaseInCents: number;
  totalInCents: number;
}): TSerializeOutput {
  return serialize({
    [NUMBER_LABEL]: String(invoice.id),
    [CLIENT_LABEL]: invoice.client?.name,
    [DATE_LABEL]: formatDate(invoice.createdAt),
    [DUE_DATE_LABEL]: formatDate(invoice.dueDate),
    [DELIVERY_NOTES_LABEL]: String(invoice.deliveryNotes.length),
    [BASE_LABEL]: formatCents(invoice.taxableBaseInCents),
    [TOTAL_LABEL]: formatCents(invoice.totalInCents),
  });
}

export function serializeSellOrderLine(sellOrderLine: TSellOrderLineForm): TSerializeOutput {
  return serialize({
    [QUANTITY_LABEL]: String(sellOrderLine.quantity),
    [QUANTITY_TO_PRODUCE_LABEL]: String(sellOrderLine.pendingQuantity),
    [DESCRIPTION_LABEL]: sellOrderLine.partReference?.part?.description ?? sellOrderLine.description,
    [REQUESTED_DELIVERY_DATE_LABEL]: formatDate(sellOrderLine.requestedDeliveryDate),
    [NOTES_LABEL]: sellOrderLine.notes,
    [REFERENCE_LABEL]: sellOrderLine.partReference?.reference,
  });
}

export function serializeSellOrder(sellOrder: TSellOrderForm): TSerializeOutput {
  return serialize({
    [CLIENT_LABEL]: sellOrder.client?.name,
    [RECEPTION_DATE_LABEL]: formatDate(sellOrder.receptionDate),
    [PAYMENT_METHOD_LABEL]: sellOrder.paymentMethod?.name,
    [NUMBER_LABEL]: String(sellOrder.id),
    [CLIENT_REFERENCE_COLUMN_LABEL]: sellOrder.clientReference,
    [NOTES_LABEL]: sellOrder.notes,
  });
}

export function serializeProductionOrder(productionOrder: {
  quantity: number | null;
  part?: { description: string } | null;
  sellOrderLine?: {
    partReference?: { reference: string } | null;
    sellOrder?: { id: number; clientReference: string | null; client?: { name: string } | null } | null;
  } | null;
}): TSerializeOutput {
  return serialize({
    [CLIENT_LABEL]: productionOrder.sellOrderLine?.sellOrder?.client?.name,
    [PART_LABEL]: productionOrder.part?.description,
    [REFERENCE_LABEL]: productionOrder.sellOrderLine?.partReference?.reference,
    [QUANTITY_LABEL]: productionOrder.quantity !== null ? String(productionOrder.quantity) : undefined,
    [SELL_ORDER_LABEL]: formatSellOrderReference(productionOrder.sellOrderLine?.sellOrder) ?? undefined,
  });
}

export function serializePart(part: { description: string }): TSerializeOutput {
  return serialize({
    [PART_LABEL]: part.description,
  });
}

export function serializePartReference(partReference: {
  reference: string;
  clientDescription: string | null;
  client?: { name: string } | null;
}): TSerializeOutput {
  return serialize({
    [REFERENCE_LABEL]: partReference.reference,
    [CLIENT_LABEL]: partReference.client?.name,
    [CLIENT_REFERENCE_DESCRIPTION_LABEL]: partReference.clientDescription,
  });
}

export function serializePartFeature(partFeature: { feature: string }): TSerializeOutput {
  return serialize({
    [PART_FEATURE_LABEL]: partFeature.feature,
  });
}

export function serializePartPrice(partPrice: {
  quantity: number | null;
  price: string | null;
  createdAt: string | Date | null;
  client?: { name: string } | null;
}): TSerializeOutput {
  return serialize({
    [QUANTITY_LABEL]: partPrice.quantity !== null ? String(partPrice.quantity) : undefined,
    [PRICE_LABEL]: partPrice.price === null ? PENDING_PRICE_LABEL : formatPrice(partPrice.price),
    [CLIENT_LABEL]: partPrice.client?.name,
    [DATE_LABEL]: formatDate(partPrice.createdAt) ?? undefined,
  });
}

export function serializeMaterial(material: {
  width: string | null;
  rawMaterial?: { name: string } | null;
  shape?: { name: string } | null;
}): TSerializeOutput {
  return serialize({
    [RAW_MATERIAL_LABEL]: material.rawMaterial?.name,
    [SHAPE_LABEL]: material.shape?.name,
    [SIZE_LABEL]: material.width,
  });
}

export function serializeBlueprint(blueprint: NonNullable<TClientBlueprint>): TSerializeOutput {
  return serialize({
    [BLUEPRINT_CREATION_DATE_LABEL]: formatDate(blueprint.createdAt),
    [NAME_LABEL]: blueprint.fileName,
  });
}

export function serializeClient(client: { name: string; legalName: string }): TSerializeOutput {
  return serialize({
    [NAME_LABEL]: client.name,
    [LEGAL_NAME_LABEL]: client.legalName,
  });
}

export function serializeClientInvoiceEmail(
  clientInvoiceEmail: { email: string },
  client: { name: string },
): TSerializeOutput {
  return serialize({
    [CLIENT_LABEL]: client.name,
    [INVOICE_EMAIL_LABEL]: clientInvoiceEmail.email,
  });
}

export function serializeRawMaterial(rawMaterial: {
  name: string;
  price: string | null;
  density: string | null;
}): TSerializeOutput {
  return serialize({
    [NAME_LABEL]: rawMaterial.name,
    [PRICE_LABEL]: rawMaterial.price !== null ? formatPricePerKilo(rawMaterial.price) : null,
    [RAW_MATERIAL_DENSITY_LABEL]: rawMaterial.density !== null ? `${rawMaterial.density} g/cm³` : null,
  });
}

export function serializeCoating(coating: { name: string }): TSerializeOutput {
  return serialize({
    [NAME_LABEL]: coating.name,
  });
}

export function serializeDeliveryMethod(deliveryMethod: { name: string }): TSerializeOutput {
  return serialize({
    [NAME_LABEL]: deliveryMethod.name,
  });
}

export function serializeMachine(machine: {
  name: string;
  minDiameter: number | null;
  maxDiameter: number | null;
}): TSerializeOutput {
  return serialize({
    [NAME_LABEL]: machine.name,
    [MACHINE_MIN_DIAMETER_LABEL]: machine.minDiameter !== null ? String(machine.minDiameter) : null,
    [MACHINE_MAX_DIAMETER_LABEL]: machine.maxDiameter !== null ? String(machine.maxDiameter) : null,
  });
}

export function serializePaymentMethod(paymentMethod: {
  name: string;
  paymentDeadlineDays: number | null;
}): TSerializeOutput {
  return serialize({
    [NAME_LABEL]: paymentMethod.name,
    [DUE_DATE_LABEL]: paymentMethod.paymentDeadlineDays !== null ? String(paymentMethod.paymentDeadlineDays) : null,
  });
}
