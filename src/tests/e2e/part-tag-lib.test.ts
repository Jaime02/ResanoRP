import { expect, test } from "@playwright/test";

import { allocateTagSellOrders } from "@/lib/part-tag";
import { groupStagedSellOrderLines, sortPendingSellOrderLines, splitQuantityFifo } from "@/lib/sell-order-line";
import { printTagPartSchema } from "@/schemas/delivery-note-line";

const EARLY = new Date("2026-03-02T08:00:00");
const LATE = new Date("2026-04-02T08:00:00");

test("the staging and part tag library", async () => {
  await test.step("a part total fills its lines in order, and the last one takes the rest", () => {
    const lines = [
      { id: 1, pendingQuantity: 32 },
      { id: 2, pendingQuantity: 40 },
    ];
    expect(splitQuantityFifo(lines, 20)).toEqual([
      { id: 1, quantity: 20 },
      { id: 2, quantity: 0 },
    ]);
    expect(splitQuantityFifo(lines, 32)).toEqual([
      { id: 1, quantity: 32 },
      { id: 2, quantity: 0 },
    ]);
    expect(splitQuantityFifo(lines, 72)).toEqual([
      { id: 1, quantity: 32 },
      { id: 2, quantity: 40 },
    ]);
    expect(splitQuantityFifo(lines, 80)).toEqual([
      { id: 1, quantity: 32 },
      { id: 2, quantity: 48 },
    ]);
    expect(splitQuantityFifo(lines, 0)).toEqual([
      { id: 1, quantity: 0 },
      { id: 2, quantity: 0 },
    ]);
    // A single line is not limited by what is pending of it, in either direction
    expect(splitQuantityFifo([{ id: 1, pendingQuantity: 32 }], 50)).toEqual([{ id: 1, quantity: 50 }]);
    expect(splitQuantityFifo([{ id: 1, pendingQuantity: 32 }], 5)).toEqual([{ id: 1, quantity: 5 }]);
    expect(splitQuantityFifo([], 5)).toEqual([]);
    expect(
      splitQuantityFifo(
        [
          { id: 1, pendingQuantity: -10 },
          { id: 2, pendingQuantity: -20 },
        ],
        -15,
      ),
    ).toEqual([
      { id: 1, quantity: -10 },
      { id: 2, quantity: -5 },
    ]);
  });

  await test.step("the pending lines of a part are served by date, and the same date by id", () => {
    const line = { partReference: { part: { id: 7 } } };
    const otherPart = { partReference: { part: { id: 8 } } };
    const sorted = sortPendingSellOrderLines([
      { ...line, id: 9, requestedDeliveryDate: null },
      { ...otherPart, id: 5, requestedDeliveryDate: LATE },
      { ...line, id: 2, requestedDeliveryDate: null },
      { ...line, id: 4, requestedDeliveryDate: EARLY },
      { ...line, id: 3, requestedDeliveryDate: EARLY },
      { id: 1, partReference: null, requestedDeliveryDate: null },
    ]);
    expect(sorted.map(({ id }) => id)).toEqual([3, 4, 2, 9, 5, 1]);
  });

  await test.step("the staged lines of a part make one row, apart from its returns", () => {
    const part = { part: { id: 7 } };
    const line = { partReference: part, quantity: 100, requestedDeliveryDate: EARLY };
    const pendingLines = [
      { ...line, id: 1, pendingQuantity: 32 },
      // Another reference of the same part
      { ...line, id: 2, partReference: { part: { id: 7 } }, pendingQuantity: 40 },
      { ...line, id: 3, pendingQuantity: -5 },
      { ...line, id: 4, partReference: null, pendingQuantity: 3 },
      { ...line, id: 5, partReference: null, pendingQuantity: 3 },
      { ...line, id: 6, partReference: { part: null }, pendingQuantity: 3 },
      { ...line, id: 7, partReference: { part: { id: 8 } }, pendingQuantity: 3 },
      // Pending but not staged
      { ...line, id: 8, pendingQuantity: 9 },
    ];
    const rows = groupStagedSellOrderLines(pendingLines, [
      { id: 2, quantity: 40 },
      { id: 1, quantity: 30 },
      { id: 3, quantity: -5 },
      { id: 4, quantity: 3 },
      { id: 5, quantity: 3 },
      { id: 6, quantity: 3 },
      { id: 7, quantity: 0 },
      // Staged but no longer pending
      { id: 99, quantity: 1 },
    ]);
    expect(rows.map((row) => [row.id, row.lines.map((groupLine) => groupLine.id), row.quantity])).toEqual([
      [1, [1, 2], 70],
      [3, [3], -5],
      [4, [4], 3],
      [5, [5], 3],
      [6, [6], 3],
      [7, [7], 0],
    ]);
    expect(rows[0].lines.map((groupLine) => groupLine.quantity)).toEqual([30, 40]);
    expect(groupStagedSellOrderLines(pendingLines, undefined)).toEqual([]);
    expect(groupStagedSellOrderLines(undefined, [{ id: 1, quantity: 1 }])).toEqual([]);
  });

  await test.step("each tag lists the Pedidos of its units, with the earliest filled first", () => {
    const sellOrderA = { quantity: 32, reference: "A", requestedDeliveryDate: EARLY };
    const sellOrderB = { quantity: 40, reference: "B", requestedDeliveryDate: LATE };
    expect(allocateTagSellOrders([30, 30, 12], [sellOrderA, sellOrderB])).toEqual([
      [{ ...sellOrderA, quantity: 30 }],
      [
        { ...sellOrderA, quantity: 2 },
        { ...sellOrderB, quantity: 28 },
      ],
      [{ ...sellOrderB, quantity: 12 }],
    ]);
    // A tag that ends exactly where a Pedido does leaves no empty entry on the next one
    expect(allocateTagSellOrders([32, 40], [sellOrderA, sellOrderB])).toEqual([
      [{ ...sellOrderA, quantity: 32 }],
      [{ ...sellOrderB, quantity: 40 }],
    ]);
    // The units beyond the staged quantities still go to the last Pedido
    expect(allocateTagSellOrders([30, 50], [sellOrderA, sellOrderB])).toEqual([
      [{ ...sellOrderA, quantity: 30 }],
      [
        { ...sellOrderA, quantity: 2 },
        { ...sellOrderB, quantity: 48 },
      ],
    ]);
    // Fewer units than staged leave the latest Pedidos out
    expect(allocateTagSellOrders([10], [sellOrderA, sellOrderB])).toEqual([[{ ...sellOrderA, quantity: 10 }]]);
    // The lines of the same Pedido share one entry on the tag, even with another Pedido between them
    expect(allocateTagSellOrders([50], [sellOrderA, { ...sellOrderA, quantity: 40 }])).toEqual([
      [{ ...sellOrderA, quantity: 50 }],
    ]);
    expect(allocateTagSellOrders([80], [sellOrderA, sellOrderB, { ...sellOrderA, quantity: 8 }])).toEqual([
      [
        { ...sellOrderA, quantity: 40 },
        { ...sellOrderB, quantity: 40 },
      ],
    ]);
    // A Pedido without units is skipped instead of holding the tags forever
    expect(allocateTagSellOrders([5], [{ ...sellOrderA, quantity: 0 }, sellOrderB])).toEqual([
      [{ ...sellOrderB, quantity: 5 }],
    ]);
    expect(allocateTagSellOrders([5], [{ ...sellOrderA, quantity: -3 }, sellOrderB])).toEqual([
      [{ ...sellOrderB, quantity: 5 }],
    ]);
    expect(allocateTagSellOrders([20, 20], [{ ...sellOrderA, quantity: Infinity }])).toEqual([
      [{ ...sellOrderA, quantity: 20 }],
      [{ ...sellOrderA, quantity: 20 }],
    ]);
    expect(allocateTagSellOrders([20], [])).toEqual([[]]);
    expect(allocateTagSellOrders([], [sellOrderA])).toEqual([]);
  });

  await test.step("no tag is printed for 0 units, of a group or of a staged line", () => {
    const tag = {
      labelSize: null,
      sellOrderLines: [{ id: 1, quantity: 5 }],
      tagGroups: [{ partQuantity: 5, tagQuantity: 1 }],
    };
    expect(printTagPartSchema.safeParse(tag).success).toBe(true);
    for (const invalidTag of [
      { ...tag, sellOrderLines: [...tag.sellOrderLines, { id: 2, quantity: 0 }] },
      { ...tag, tagGroups: [{ partQuantity: 0, tagQuantity: 1 }] },
      { ...tag, tagGroups: [{ partQuantity: 5, tagQuantity: 0 }] },
    ]) {
      expect(printTagPartSchema.safeParse(invalidTag).success).toBe(false);
    }
  });
});
