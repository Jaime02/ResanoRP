import { expect, test } from "@playwright/test";

import {
  computeProductionOrderStatus,
  getProductionOrderPendingQuantity,
  isProductionFinished,
} from "@/lib/production-order";
import type { TProductionOrderStatusInput } from "@/lib/production-order";
import { computeSellOrderLineStatus } from "@/lib/sell-order-line";
import { ProductionOrderStatus } from "@/schemas/production-order";
import { SellOrderLineStatus } from "@/schemas/sell-order-line";

const DATE = new Date("2026-03-02T08:00:00");

const produced: TProductionOrderStatusInput = {
  deletedAt: null,
  isActiveOnMachine: false,
  needsTreatment: true,
  producedQuantity: 10,
  quantity: 10,
  receivedQuantity: 0,
  sellOrderLine: { deletedAt: null, sellOrder: { deletedAt: null } },
  sentQuantity: 0,
};

const pendingLine: { deletedAt: Date | null; pendingQuantity: number } = { deletedAt: null, pendingQuantity: 5 };
const activeSellOrder = { deletedAt: null };

test("the production order status library", async () => {
  await test.step("a deleted production order, sell order line or sell order wins over everything else", () => {
    expect(computeProductionOrderStatus({ ...produced, deletedAt: DATE })).toBe(ProductionOrderStatus.Deleted);
    expect(
      computeProductionOrderStatus({ ...produced, sellOrderLine: { deletedAt: DATE, sellOrder: { deletedAt: DATE } } }),
    ).toBe(ProductionOrderStatus.SellOrderLineDeleted);
    expect(
      computeProductionOrderStatus({ ...produced, sellOrderLine: { deletedAt: null, sellOrder: { deletedAt: DATE } } }),
    ).toBe(ProductionOrderStatus.SellOrderDeleted);
    // Without a sell order line there is nothing else that can be deleted
    expect(
      computeProductionOrderStatus({ ...produced, sellOrderLine: null, sentQuantity: 10, receivedQuantity: 10 }),
    ).toBe(ProductionOrderStatus.Completed);
  });

  await test.step("with a quantity, it is pending or in production until it reaches it", () => {
    expect(computeProductionOrderStatus({ ...produced, producedQuantity: 9 })).toBe(ProductionOrderStatus.Pending);
    expect(computeProductionOrderStatus({ ...produced, producedQuantity: 9, isActiveOnMachine: true })).toBe(
      ProductionOrderStatus.InProduction,
    );
    // Reaching the quantity finishes the production even while a machine still runs it
    expect(computeProductionOrderStatus({ ...produced, isActiveOnMachine: true })).toBe(
      ProductionOrderStatus.PendingTreatment,
    );
    expect(computeProductionOrderStatus({ ...produced, producedQuantity: 15 })).toBe(
      ProductionOrderStatus.PendingTreatment,
    );
  });

  await test.step("without a quantity, it is produced once no machine runs it and something was produced", () => {
    const withoutQuantity = { ...produced, quantity: null };
    expect(computeProductionOrderStatus({ ...withoutQuantity, producedQuantity: 0 })).toBe(
      ProductionOrderStatus.Pending,
    );
    expect(computeProductionOrderStatus({ ...withoutQuantity, producedQuantity: 0, isActiveOnMachine: true })).toBe(
      ProductionOrderStatus.InProduction,
    );
    expect(computeProductionOrderStatus({ ...withoutQuantity, isActiveOnMachine: true })).toBe(
      ProductionOrderStatus.InProduction,
    );
    expect(computeProductionOrderStatus(withoutQuantity)).toBe(ProductionOrderStatus.PendingTreatment);
  });

  await test.step("a part without a coating is completed as soon as it is produced", () => {
    expect(computeProductionOrderStatus({ ...produced, needsTreatment: false })).toBe(ProductionOrderStatus.Completed);
    expect(computeProductionOrderStatus({ ...produced, needsTreatment: false, quantity: null })).toBe(
      ProductionOrderStatus.Completed,
    );
  });

  await test.step("a part with a coating goes through the treatment before it is completed", () => {
    expect(computeProductionOrderStatus({ ...produced, sentQuantity: 4 })).toBe(ProductionOrderStatus.InTreatment);
    // Some parts out and some still to send is shown as in the treatment
    expect(computeProductionOrderStatus({ ...produced, sentQuantity: 4, receivedQuantity: 2 })).toBe(
      ProductionOrderStatus.InTreatment,
    );
    // Nothing out, but some still to send
    expect(computeProductionOrderStatus({ ...produced, sentQuantity: 4, receivedQuantity: 4 })).toBe(
      ProductionOrderStatus.PendingTreatment,
    );
    expect(computeProductionOrderStatus({ ...produced, sentQuantity: 10, receivedQuantity: 9 })).toBe(
      ProductionOrderStatus.InTreatment,
    );
    expect(computeProductionOrderStatus({ ...produced, sentQuantity: 10, receivedQuantity: 10 })).toBe(
      ProductionOrderStatus.Completed,
    );
    // More parts can be sent than were produced
    expect(computeProductionOrderStatus({ ...produced, sentQuantity: 12, receivedQuantity: 10 })).toBe(
      ProductionOrderStatus.InTreatment,
    );
    expect(computeProductionOrderStatus({ ...produced, sentQuantity: 12, receivedQuantity: 12 })).toBe(
      ProductionOrderStatus.Completed,
    );
    // The parts sent while it was still being produced do not finish it
    expect(
      computeProductionOrderStatus({ ...produced, producedQuantity: 5, sentQuantity: 5, receivedQuantity: 5 }),
    ).toBe(ProductionOrderStatus.Pending);
    expect(
      computeProductionOrderStatus({ ...produced, producedQuantity: 5, sentQuantity: 5, isActiveOnMachine: true }),
    ).toBe(ProductionOrderStatus.InProduction);
  });

  await test.step("isProductionFinished is true once the machines are done with it", () => {
    expect(Object.values(ProductionOrderStatus).filter(isProductionFinished).sort()).toEqual(
      [
        ProductionOrderStatus.Completed,
        ProductionOrderStatus.InTreatment,
        ProductionOrderStatus.PendingTreatment,
      ].sort(),
    );
  });
});

test("the sell order line status library", async () => {
  const lineStatus = (productionOrderStatuses: Array<ProductionOrderStatus>, line = pendingLine) =>
    computeSellOrderLineStatus({ productionOrderStatuses, sellOrder: activeSellOrder, sellOrderLine: line });

  await test.step("the line and its sell order are checked before its production orders", () => {
    const statuses = [ProductionOrderStatus.InProduction];
    expect(lineStatus(statuses, { deletedAt: DATE, pendingQuantity: 5 })).toBe(SellOrderLineStatus.Deleted);
    expect(
      computeSellOrderLineStatus({
        productionOrderStatuses: statuses,
        sellOrder: { deletedAt: DATE },
        sellOrderLine: pendingLine,
      }),
    ).toBe(SellOrderLineStatus.SellOrderDeleted);
    expect(lineStatus(statuses, { deletedAt: null, pendingQuantity: 0 })).toBe(SellOrderLineStatus.Completed);
  });

  await test.step("each production order status has the line status it gives", () => {
    // A Record, so a new production order status does not compile until its line status is decided here
    const expectedLineStatuses: Record<ProductionOrderStatus, SellOrderLineStatus> = {
      [ProductionOrderStatus.Completed]: SellOrderLineStatus.ProductionFinished,
      [ProductionOrderStatus.Deleted]: SellOrderLineStatus.Pending,
      [ProductionOrderStatus.InProduction]: SellOrderLineStatus.InProduction,
      [ProductionOrderStatus.InTreatment]: SellOrderLineStatus.InTreatment,
      [ProductionOrderStatus.Pending]: SellOrderLineStatus.ProductionPending,
      [ProductionOrderStatus.PendingTreatment]: SellOrderLineStatus.PendingTreatment,
      [ProductionOrderStatus.SellOrderDeleted]: SellOrderLineStatus.Pending,
      [ProductionOrderStatus.SellOrderLineDeleted]: SellOrderLineStatus.Pending,
    };
    for (const productionOrderStatus of Object.values(ProductionOrderStatus)) {
      expect(lineStatus([productionOrderStatus]), productionOrderStatus).toBe(
        expectedLineStatuses[productionOrderStatus],
      );
    }
  });

  await test.step("without production orders, or only deleted ones, the line is pending", () => {
    expect(lineStatus([])).toBe(SellOrderLineStatus.Pending);
    expect(
      lineStatus([
        ProductionOrderStatus.Deleted,
        ProductionOrderStatus.SellOrderDeleted,
        ProductionOrderStatus.SellOrderLineDeleted,
      ]),
    ).toBe(SellOrderLineStatus.Pending);
    // A deleted production order does not hide the status of the others
    expect(lineStatus([ProductionOrderStatus.Deleted, ProductionOrderStatus.Completed])).toBe(
      SellOrderLineStatus.ProductionFinished,
    );
  });

  await test.step("with several production orders, the production comes first, then the parts out in the treatment", () => {
    const priority = [
      [ProductionOrderStatus.InProduction, SellOrderLineStatus.InProduction],
      [ProductionOrderStatus.Pending, SellOrderLineStatus.ProductionPending],
      [ProductionOrderStatus.InTreatment, SellOrderLineStatus.InTreatment],
      [ProductionOrderStatus.PendingTreatment, SellOrderLineStatus.PendingTreatment],
      [ProductionOrderStatus.Completed, SellOrderLineStatus.ProductionFinished],
    ] as const;
    for (const [index, [productionOrderStatus, expectedLineStatus]] of priority.entries()) {
      const lowerStatuses = priority.slice(index + 1).map(([status]) => status);
      expect(lineStatus([...lowerStatuses, productionOrderStatus]), productionOrderStatus).toBe(expectedLineStatus);
    }
  });
});

test("the pending quantity of a production order", () => {
  expect(getProductionOrderPendingQuantity(10, undefined)).toBe(10);
  expect(getProductionOrderPendingQuantity(10, 4)).toBe(6);
  expect(getProductionOrderPendingQuantity(10, 10)).toBe(0);
  // Producing more than asked does not go negative
  expect(getProductionOrderPendingQuantity(10, 15)).toBe(0);
  // Without a quantity there is nothing to count down
  expect(getProductionOrderPendingQuantity(null, 4)).toBeNull();
});
