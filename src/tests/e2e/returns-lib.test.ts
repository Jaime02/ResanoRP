import { expect, test } from "@playwright/test";

import { clampPendingQuantity, computeSellOrderLineStatus } from "@/lib/sell-order-line";
import { buildStockLedger } from "@/queries/part-stock";
import { appendLinesToDeliveryNoteSchema, createDeliveryNoteWithLinesSchema } from "@/schemas/delivery-note";
import { createDeliveryNoteLineSchema, updateDeliveryNoteLineSchema } from "@/schemas/delivery-note-line";
import { createSellOrderLineSchema, SellOrderLineStatus } from "@/schemas/sell-order-line";

const DATE = new Date("2026-03-02T08:00:00");

test("the returns library", async () => {
  await test.step("the pending quantity stays between 0 and the quantity, also for a return", () => {
    expect(clampPendingQuantity(40, 100)).toBe(40);
    expect(clampPendingQuantity(140, 100)).toBe(100);
    expect(clampPendingQuantity(-10, 100)).toBe(0);
    expect(clampPendingQuantity(-40, -100)).toBe(-40);
    expect(clampPendingQuantity(-140, -100)).toBe(-100);
    expect(clampPendingQuantity(10, -100)).toBe(0);
    // Turning a line into a return leaves nothing to deliver until its pending quantity is set again
    expect(clampPendingQuantity(100, -100)).toBe(0);
  });

  await test.step("the pending quantity never asks for parts that were already delivered", () => {
    expect(clampPendingQuantity(6, 10, 6)).toBe(4);
    expect(clampPendingQuantity(4, 10, -30)).toBe(4);
    expect(clampPendingQuantity(140, 100, -30)).toBe(100);
    expect(clampPendingQuantity(-100, -170, -100)).toBe(-70);
    expect(clampPendingQuantity(-10, -170, -100)).toBe(-10);
  });

  await test.step("a line can have a negative quantity, but never 0", () => {
    const sellOrderLine = { notes: null, partPrice: "0.82", requestedDeliveryDate: null, sellOrderId: 1 };
    const partSellOrderLine = { ...sellOrderLine, description: null, partReferenceId: 1 };
    const customSellOrderLine = { ...sellOrderLine, description: "Devolución", partReferenceId: null };
    for (const line of [partSellOrderLine, customSellOrderLine]) {
      expect(createSellOrderLineSchema.safeParse({ ...line, quantity: -170 }).success).toBe(true);
      expect(createSellOrderLineSchema.safeParse({ ...line, quantity: 0 }).success).toBe(false);
    }

    const deliveryNoteLine = { deliveryNoteId: 1, description: "Devolución", partReferenceId: null, unitPrice: null };
    expect(createDeliveryNoteLineSchema.safeParse({ ...deliveryNoteLine, quantity: -170 }).success).toBe(true);
    expect(createDeliveryNoteLineSchema.safeParse({ ...deliveryNoteLine, quantity: 0 }).success).toBe(false);
    expect(updateDeliveryNoteLineSchema.safeParse({ id: 1, quantity: -1 }).success).toBe(true);
    expect(updateDeliveryNoteLineSchema.safeParse({ id: 1, quantity: 0 }).success).toBe(false);

    // A staged line left at 0 by lowering the total of its part is not delivered, but something has to be
    for (const [schema, deliveryNote] of [
      [createDeliveryNoteWithLinesSchema, { clientId: 1, deliveryMethodId: null }],
      [appendLinesToDeliveryNoteSchema, { deliveryNoteId: 1 }],
    ] as const) {
      const parse = (stagedSellOrderLines: Array<{ id: number; quantity: number }>) =>
        schema.safeParse({ ...deliveryNote, stagedSellOrderLines });
      expect(parse([{ id: 1, quantity: -5 }]).success).toBe(true);
      expect(
        parse([
          { id: 1, quantity: 0 },
          { id: 2, quantity: 5 },
        ]).data?.stagedSellOrderLines,
      ).toEqual([{ id: 2, quantity: 5 }]);
      expect(parse([{ id: 1, quantity: 0 }]).success).toBe(false);
      expect(parse([]).success).toBe(false);
    }
  });

  await test.step("a line and its price can be negative, like a discount", () => {
    const line = { deliveryNoteId: 1, description: "Abono", partReferenceId: null, quantity: 1 };
    expect(createDeliveryNoteLineSchema.parse({ ...line, unitPrice: "-733.15" }).unitPrice).toBe("-733.15");
  });

  await test.step("a return is pending until it is delivered back", () => {
    const sellOrder = { deletedAt: null };
    const status = (pendingQuantity: number) =>
      computeSellOrderLineStatus({
        productionOrderStatuses: [],
        sellOrder,
        sellOrderLine: { deletedAt: null, pendingQuantity },
      });
    expect(status(-170)).toBe(SellOrderLineStatus.Pending);
    expect(status(0)).toBe(SellOrderLineStatus.Completed);
  });

  await test.step("the returned parts do not go back into the stock", () => {
    const at = (minutes: number) => new Date(DATE.getTime() + minutes * 60 * 1000);
    const ledger = buildStockLedger(
      [{ __typename: "PartProduction" as const, date: at(0), quantity: 100 }],
      [
        { __typename: "DeliveryNoteLine" as const, date: at(1), quantity: 30 },
        { __typename: "DeliveryNoteLine" as const, date: at(2), quantity: -20 },
      ],
      [],
    );
    expect(ledger.map(({ finalQuantity }) => finalQuantity)).toEqual([70, 70, 100]);
  });
});
