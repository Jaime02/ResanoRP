import { formatPrice } from "@/lib/formatters";

interface TPricedLine {
  quantity: number;
  unitPrice: string | null;
}

// A Línea from a Pedido de venta takes its price, so changing it also changes its Albaranes and Facturas. Unless the
// Línea has a price of its own: the one agreed when it was delivered, like in the Albaranes migrated from Prisma.
export function getDeliveryNoteLineUnitPrice(deliveryNoteLine: {
  unitPrice: string | null;
  sellOrderLine?: { partPrice: string | null } | null;
}): string | null {
  return deliveryNoteLine.unitPrice ?? deliveryNoteLine.sellOrderLine?.partPrice ?? null;
}

export function getUnpricedDeliveryNoteIds(
  deliveryNotes: Array<{
    id: number;
    deliveryNoteLines: Array<Parameters<typeof getDeliveryNoteLineUnitPrice>[0]>;
  }>,
): Array<number> {
  return deliveryNotes
    .filter((deliveryNote) =>
      deliveryNote.deliveryNoteLines.some(
        (deliveryNoteLine) => getDeliveryNoteLineUnitPrice(deliveryNoteLine) === null,
      ),
    )
    .map((deliveryNote) => deliveryNote.id)
    .sort((a, b) => a - b);
}

// Amounts are added up as whole cents. Prices are stored with any number of decimals, and multiplying them as
// floating point numbers lands just below the halves (1.005 becomes 1.00), so the displayed totals would not match
// the sum of the displayed amounts.
export function getLineTotalInCents({ unitPrice, quantity }: TPricedLine): number | null {
  if (unitPrice === null) return null;
  const [integerDigits, fractionDigits = ""] = unitPrice.split(".");
  const scale = 10n ** BigInt(fractionDigits.length);
  const scaledTotalInCents = BigInt(integerDigits + fractionDigits) * BigInt(quantity) * 100n;
  // BigInt division truncates toward zero, so the half is added to the size of the amount and its sign put back after
  const sign = scaledTotalInCents < 0n ? -1n : 1n;
  return Number(sign * ((sign * scaledTotalInCents * 2n + scale) / (scale * 2n)));
}

export function getLinesTotalInCents(lines: Array<TPricedLine>): number {
  return lines.reduce((accumulated, line) => accumulated + (getLineTotalInCents(line) ?? 0), 0);
}

// Math.round takes the halves up, so a negative base is rounded by its size like a positive one
function getVatInCents(taxableBaseInCents: number, vatPercentage: number): number {
  const vatInCents = Math.round((Math.abs(taxableBaseInCents) * vatPercentage) / 100);
  return taxableBaseInCents < 0 && vatInCents !== 0 ? -vatInCents : vatInCents;
}

interface TVatLine extends TPricedLine {
  vatPercentage: number;
}

export interface TVatBreakdownItem {
  vatPercentage: number;
  taxableBaseInCents: number;
  vatInCents: number;
}

// The VAT is rounded once for each rate, which is how the invoices state it, instead of once for each line
export function getVatBreakdown(lines: Array<TVatLine>): Array<TVatBreakdownItem> {
  const taxableBaseByVatPercentage = new Map<number, number>();
  for (const line of lines) {
    const taxableBaseInCents = taxableBaseByVatPercentage.get(line.vatPercentage) ?? 0;
    taxableBaseByVatPercentage.set(line.vatPercentage, taxableBaseInCents + (getLineTotalInCents(line) ?? 0));
  }
  return [...taxableBaseByVatPercentage]
    .map(([vatPercentage, taxableBaseInCents]) => ({
      taxableBaseInCents,
      vatInCents: getVatInCents(taxableBaseInCents, vatPercentage),
      vatPercentage,
    }))
    .sort((a, b) => b.vatPercentage - a.vatPercentage);
}

export function getTotalWithVatInCents(lines: Array<TVatLine>): number {
  return getVatBreakdown(lines).reduce(
    (accumulated, item) => accumulated + item.taxableBaseInCents + item.vatInCents,
    0,
  );
}

export function formatCents(cents: number | null): string {
  return formatPrice(cents === null ? null : cents / 100, { decimals: 2 });
}
