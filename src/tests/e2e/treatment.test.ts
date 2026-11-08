import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { subDays } from "date-fns";
import { eq } from "drizzle-orm";

import { UserMode } from "@/contexts/app-context";
import {
  dbGetProductionOrderStatus,
  getProductionOrderById,
  getProductionOrderProducedQuantity,
} from "@/db/functions/production-order";
import { getSellOrderLineById, getSellOrderLineStatus } from "@/db/functions/sell-order-line";
import {
  dbTableMachine,
  dbTablePart,
  dbTablePartProduction,
  dbTableProductionOrder,
  dbTableSellOrder,
  dbTableTreatmentReception,
  dbTableTreatmentShipment,
} from "@/db/schema";
import { isSameAppDay } from "@/lib/dates";
import { formatPartUnits } from "@/lib/formatters";
import { getSellOrderLineStatusDisplay } from "@/lib/sell-order-line";
import { translatedEnums } from "@/lib/translations";
import {
  TREATMENT_HISTORY_EMPTY_MESSAGE,
  TREATMENT_LABEL,
  WITHOUT_ORDER_LABEL,
  NO_PARTS_IN_TREATMENT_MESSAGE,
} from "@/messages/treatment";
import { ProductionOrderStatus } from "@/schemas/production-order";
import { SellOrderLineStatus } from "@/schemas/sell-order-line";
import {
  MOCK_INITIAL_DATE,
  mockCoatings,
  mockMachines,
  mockParts,
  mockProductionOrders,
  mockSellOrderLines,
  mockTreatmentReceptions,
  mockTreatmentShipments,
} from "@/tests/mock-data";
import { openAndConfirmAlertDialog } from "@/tests/utils/components/alert-dialog";
import { getDateInputValue } from "@/tests/utils/components/date-input";
import { clearPicker } from "@/tests/utils/components/picker";
import {
  assertTableRowCount,
  getEditableCellById,
  getTableRowByTestId,
  getTableRows,
} from "@/tests/utils/components/table";
import { TestAnnotations, setUserMode, test } from "@/tests/utils/fixtures";
import { getMockSellOrderLineById, getMockTreatmentQuantities } from "@/tests/utils/mock-data-utils";
import { holdRequestWhile } from "@/tests/utils/trpc";
import { gotoProductionOrdersWithStatuses } from "@/tests/workflows/production";
import {
  assertFillPendingButton,
  getMockProducedQuantity,
  getMockTreatmentBatches,
  getButtonReceiveTreatment,
  getMockTreatmentPendingProductionOrders,
  getNewTreatmentReceptions,
  getNewTreatmentShipments,
  getTableTreatmentBatch,
  getTreatmentLocators,
  workflowFilterTreatmentHistory,
  isMockCoatedProductionOrder,
  workflowDeleteTreatmentReception,
  workflowDeleteTreatmentShipment,
  workflowReceiveFromTreatment,
  workflowSendPartToTreatment,
  workflowSendToTreatment,
} from "@/tests/workflows/treatment";

const pendingProductionOrders = getMockTreatmentPendingProductionOrders();
const batches = getMockTreatmentBatches();
const batchOut = batches.find((batch) => !batch.isReceived)!;
const batchReceived = batches.find((batch) => batch.isReceived)!;

// The production order still running on a machine, with parts already sent
const inProductionProductionOrder = mockProductionOrders.find(
  (productionOrder) =>
    mockMachines.some((machine) => machine.activeProductionOrderId === productionOrder.id) &&
    mockTreatmentShipments.some((shipment) => shipment.productionOrderId === productionOrder.id),
)!;
// The production order produced, of a coated part, with nothing sent yet
const pendingTreatmentProductionOrder = pendingProductionOrders.find(
  ({ sentQuantity, productionOrder }) => sentQuantity === 0 && productionOrder.id !== inProductionProductionOrder.id,
)!;
// The production order produced, of a coated part, with some parts already sent and some still to send
const partiallySentProductionOrder = pendingProductionOrders.find(
  ({ sentQuantity, productionOrder }) => sentQuantity > 0 && productionOrder.id !== inProductionProductionOrder.id,
)!;
// The production order that sent and got back more parts than it produced
const overSentProductionOrder = mockProductionOrders.find(
  (productionOrder) =>
    isMockCoatedProductionOrder(productionOrder) &&
    getMockTreatmentQuantities(productionOrder.id).sentQuantity > getMockProducedQuantity(productionOrder.id),
)!;
const coatedPart = mockParts.find((part) => part.deletedAt === null && part.coatingId !== null)!;

test.beforeAll(() => {
  expect(pendingProductionOrders.length, "Wrong test set up: Some parts should be pending to send").toBeGreaterThan(2);
  expect(batchOut, "Wrong test set up: Some batch should be out").toBeDefined();
  expect(
    batchOut.treatmentShipments.length,
    "Wrong test set up: The batch out should have several orders",
  ).toBeGreaterThan(1);
  expect(
    batchOut.treatmentShipments.some((shipment) => shipment.treatmentReceptions.length > 0),
    "Wrong test set up: The batch out should be partially received",
  ).toBe(true);
  expect(batchReceived, "Wrong test set up: Some batch should be fully received").toBeDefined();
  expect(inProductionProductionOrder, "Wrong test set up: A running order should have sent parts").toBeDefined();
  expect(pendingTreatmentProductionOrder, "Wrong test set up: A produced order should have nothing sent").toBeDefined();
  expect(
    pendingTreatmentProductionOrder.unsentQuantity,
    "Wrong test set up: The order with nothing sent should have several parts to send",
  ).toBeGreaterThan(1);
  expect(partiallySentProductionOrder, "Wrong test set up: A produced order should be partially sent").toBeDefined();
  expect(overSentProductionOrder, "Wrong test set up: An order should have sent more than it produced").toBeDefined();
  const { sentQuantity, receivedQuantity } = getMockTreatmentQuantities(overSentProductionOrder.id);
  expect(receivedQuantity, "Wrong test set up: The over sent order should be fully received").toBe(sentQuantity);
  expect(
    batchOut.treatmentShipments.some((shipment) => shipment.pendingQuantity > 1),
    "Wrong test set up: A shipment out should have several parts to receive",
  ).toBe(true);
});

async function gotoTreatment(page: Page) {
  await page.goto("/treatment");
  await expect(getTreatmentLocators(page).tablePending).toBeVisible();
}

async function assertProductionOrderStatus(
  page: Page,
  productionOrderId: number,
  expectedStatus: ProductionOrderStatus,
) {
  expect(await dbGetProductionOrderStatus((await getProductionOrderById(productionOrderId))!)).toBe(expectedStatus);

  // The status column and the status filter of the table agree with the server
  const tableProductionOrders = page.getByTestId("table-production-order");
  await gotoProductionOrdersWithStatuses(page, [expectedStatus]);
  await expect(getTableRowByTestId(tableProductionOrders, productionOrderId).getByTestId("status")).toHaveText(
    translatedEnums.ProductionOrderStatus[expectedStatus],
  );
  await gotoProductionOrdersWithStatuses(
    page,
    Object.values(ProductionOrderStatus).filter((status) => status !== expectedStatus),
  );
  await expect(getTableRows(tableProductionOrders).first()).toBeVisible();
  await expect(getTableRowByTestId(tableProductionOrders, productionOrderId)).toHaveCount(0);
}

test("open the treatment page from the home page in every user mode", async ({ page }) => {
  for (const [userMode, machineId] of [
    [UserMode.Admin, undefined],
    [UserMode.User, undefined],
    [UserMode.Machine, mockMachines.find((machine) => machine.deletedAt === null)!.id],
  ] as const) {
    await setUserMode(page, userMode, machineId);
    await page.goto("/");
    await page.getByRole("link", { name: TREATMENT_LABEL, exact: true }).click();
    await expect(page).toHaveURL((url) => url.pathname === "/treatment");
    await expect(getTreatmentLocators(page).tablePending).toBeVisible();
  }
});

test("list the parts pending to send and the batches out and back", async ({ page }) => {
  await gotoTreatment(page);
  const { tablePending, sectionOut, sectionHistory } = getTreatmentLocators(page);

  await test.step("only the produced parts of coated, not deleted, production orders are pending to send", async () => {
    await assertTableRowCount(tablePending, pendingProductionOrders.length);
    for (const { productionOrder, producedQuantity, sentQuantity, unsentQuantity } of pendingProductionOrders) {
      const row = getTableRowByTestId(tablePending, productionOrder.id);
      const part = mockParts.find(({ id }) => id === productionOrder.partId)!;
      await expect(row.getByTestId("description")).toHaveText(part.description);
      await expect(row.getByTestId("coating")).toHaveText(mockCoatings.find(({ id }) => id === part.coatingId)!.name);
      await expect(row.getByTestId("producedQuantity")).toHaveText(String(producedQuantity));
      await expect(row.getByTestId("sentQuantity")).toHaveText(String(sentQuantity));
      await expect(row.getByTestId("unsentQuantity")).toHaveText(String(unsentQuantity));
      await expect(getEditableCellById(row, "sendQuantity")).toHaveValue("");
    }
    // Nothing is typed yet
    await expect(page.getByTestId("button-send-treatment")).toBeDisabled();

    for (const productionOrder of mockProductionOrders.filter(
      ({ id }) => !pendingProductionOrders.some((pending) => pending.productionOrder.id === id),
    )) {
      await expect(getTableRowByTestId(tablePending, productionOrder.id)).toHaveCount(0);
    }
    expect(
      mockProductionOrders.some((productionOrder) => !isMockCoatedProductionOrder(productionOrder)),
      "Wrong test set up: Some production order should be of a part without a coating",
    ).toBe(true);
  });

  await test.step("an order that sent more parts than it produced is not pending and is completed", async () => {
    await expect(getTableRowByTestId(tablePending, overSentProductionOrder.id)).toHaveCount(0);
    expect(await dbGetProductionOrderStatus((await getProductionOrderById(overSentProductionOrder.id))!)).toBe(
      ProductionOrderStatus.Completed,
    );
  });

  await workflowFilterTreatmentHistory(page, { date: batchReceived.sentAt });
  for (const [section, otherSection, batch] of [
    [sectionOut, sectionHistory, batchOut],
    [sectionHistory, sectionOut, batchReceived],
  ] as const) {
    await test.step(`the batch sent at ${batch.sentAt.toISOString()} is listed with its receptions`, async () => {
      const tableBatch = section.getByTestId(`table-treatment-batch-${batch.sentAt.getTime()}`);
      await assertTableRowCount(tableBatch, batch.treatmentShipments.length);
      await expect(otherSection.getByTestId(`table-treatment-batch-${batch.sentAt.getTime()}`)).toHaveCount(0);
      await expect(getButtonReceiveTreatment(tableBatch)).toHaveCount(batch.isReceived ? 0 : 1);

      for (const shipment of batch.treatmentShipments) {
        const row = getTableRowByTestId(tableBatch, shipment.id);
        await expect(row.getByTestId("quantity")).toHaveText(String(shipment.quantity));
        await expect(row.getByTestId("receivedQuantity")).toHaveText(String(shipment.receivedQuantity));
        await expect(row.getByTestId("pendingQuantity")).toHaveText(String(shipment.pendingQuantity));
        for (const reception of shipment.treatmentReceptions) {
          await expect(row.getByTestId(`div-treatment-reception-${reception.id}`)).toContainText(
            `${formatPartUnits(reception.quantity)} |`,
          );
        }
        await expect(row.getByTestId("receiveQuantity").getByTestId("editable-cell-input")).toHaveCount(
          shipment.pendingQuantity > 0 ? 1 : 0,
        );
        // A shipment can only be deleted until some of its parts are received
        await expect(row.getByTestId("button-delete")).toHaveCount(shipment.treatmentReceptions.length === 0 ? 1 : 0);
      }
    });
  }
});

test("the history defaults to today and needs a day or a part to be listed", async ({ page }) => {
  await gotoTreatment(page);
  const { sectionHistory } = getTreatmentLocators(page);
  const tableBatchReceived = getTableTreatmentBatch(page, batchReceived.sentAt);
  const { partId } = batchReceived.treatmentShipments[0];
  const partShipments = batchReceived.treatmentShipments.filter((shipment) => shipment.partId === partId);

  await test.step("the day defaults to today", async () => {
    const dateInput = sectionHistory.getByTestId("input-treatment-history-date");
    expect(isSameAppDay((await getDateInputValue(dateInput))!, MOCK_INITIAL_DATE)).toBe(true);
    await expect(sectionHistory).toContainText(NO_PARTS_IN_TREATMENT_MESSAGE);
  });

  await test.step("without filters nothing is listed", async () => {
    await sectionHistory.getByTestId("input-treatment-history-date").getByTestId("button-clear").click();
    await expect(sectionHistory).toContainText(TREATMENT_HISTORY_EMPTY_MESSAGE);
    await expect(tableBatchReceived).toHaveCount(0);
  });

  await test.step("a part lists only its shipments", async () => {
    await workflowFilterTreatmentHistory(page, { partId });
    await assertTableRowCount(tableBatchReceived, partShipments.length);
  });

  await test.step("a day and a part list the shipments of the part sent that day", async () => {
    await workflowFilterTreatmentHistory(page, { date: batchReceived.sentAt });
    await assertTableRowCount(tableBatchReceived, partShipments.length);
  });

  await test.step("a day lists every shipment sent that day", async () => {
    await clearPicker(sectionHistory.getByTestId("picker-treatment-history-part"));
    await assertTableRowCount(tableBatchReceived, batchReceived.treatmentShipments.length);
  });

  await test.step("a day lists the shipments whose parts came back that day too", async () => {
    const { receivedAt } = batchReceived.treatmentShipments[0].treatmentReceptions[0];
    expect(
      isSameAppDay(receivedAt, batchReceived.sentAt),
      "Wrong test set up: The parts should come back on another day",
    ).toBe(false);
    await workflowFilterTreatmentHistory(page, { date: receivedAt });
    await assertTableRowCount(
      tableBatchReceived,
      batchReceived.treatmentShipments.filter((shipment) =>
        shipment.treatmentReceptions.some((reception) => isSameAppDay(reception.receivedAt, receivedAt)),
      ).length,
    );
  });

  await test.step("a day without shipments lists nothing", async () => {
    await workflowFilterTreatmentHistory(page, { date: subDays(MOCK_INITIAL_DATE, 3) });
    await expect(sectionHistory).toContainText(NO_PARTS_IN_TREATMENT_MESSAGE);
  });
});

for (const [userMode, machineId] of [
  [UserMode.Admin, undefined],
  [UserMode.User, undefined],
  [UserMode.Machine, mockMachines.find((machine) => machine.deletedAt === null)!.id],
] as const) {
  test(`as ${userMode}, send parts of several production orders in one batch`, async ({ page }) => {
    await setUserMode(page, userMode, machineId);
    await gotoTreatment(page);
    const { tablePending, sectionOut } = getTreatmentLocators(page);
    const partialProductionOrder = pendingProductionOrders.find(
      ({ unsentQuantity, productionOrder }) =>
        unsentQuantity > 1 && productionOrder.id !== pendingTreatmentProductionOrder.productionOrder.id,
    )!;
    expect(partialProductionOrder, "Wrong test set up: Some order should have several parts to send").toBeDefined();

    // The plus button fills in every pending part of the order, the other one is typed
    const fullRow = getTableRowByTestId(tablePending, pendingTreatmentProductionOrder.productionOrder.id);
    await fullRow.getByTestId("button-send-all-pending").click();
    await expect(getEditableCellById(fullRow, "sendQuantity")).toHaveValue(
      String(pendingTreatmentProductionOrder.unsentQuantity),
    );
    await expect(fullRow.getByTestId("button-send-all-pending")).toHaveAttribute("data-clickable", "false");
    await workflowSendToTreatment(page, [
      { productionOrderId: partialProductionOrder.productionOrder.id, quantity: 1 },
    ]);

    const newShipments = await getNewTreatmentShipments();
    expect(
      newShipments
        .map(({ productionOrderId, quantity }) => ({ productionOrderId: productionOrderId!, quantity }))
        .sort((a, b) => a.productionOrderId - b.productionOrderId),
    ).toEqual(
      [
        {
          productionOrderId: pendingTreatmentProductionOrder.productionOrder.id,
          quantity: pendingTreatmentProductionOrder.unsentQuantity,
        },
        { productionOrderId: partialProductionOrder.productionOrder.id, quantity: 1 },
      ].sort((a, b) => a.productionOrderId - b.productionOrderId),
    );
    // Both shipments belong to the same batch
    expect(new Set(newShipments.map((shipment) => shipment.sentAt.getTime())).size).toBe(1);

    // The fully sent order leaves the pending table, the other one shows what is left
    await expect(getTableRowByTestId(tablePending, pendingTreatmentProductionOrder.productionOrder.id)).toHaveCount(0);
    const partialRow = getTableRowByTestId(tablePending, partialProductionOrder.productionOrder.id);
    await expect(partialRow.getByTestId("unsentQuantity")).toHaveText(
      String(partialProductionOrder.unsentQuantity - 1),
    );
    await expect(partialRow.getByTestId("sentQuantity")).toHaveText(String(partialProductionOrder.sentQuantity + 1));
    await expect(getEditableCellById(partialRow, "sendQuantity")).toHaveValue("");

    const tableNewBatch = sectionOut.getByTestId(`table-treatment-batch-${newShipments[0].sentAt.getTime()}`);
    await assertTableRowCount(tableNewBatch, 2);
    for (const shipment of newShipments) {
      const row = getTableRowByTestId(tableNewBatch, shipment.id);
      await expect(row.getByTestId("quantity")).toHaveText(String(shipment.quantity));
      await expect(row.getByTestId("pendingQuantity")).toHaveText(String(shipment.quantity));
      await expect(row.getByTestId("button-delete")).toBeVisible();
    }

    expect(
      await dbGetProductionOrderStatus(
        (await getProductionOrderById(pendingTreatmentProductionOrder.productionOrder.id))!,
      ),
    ).toBe(ProductionOrderStatus.InTreatment);
  });
}

test("receive a batch in several times, then it moves to the history", async ({ page }) => {
  await gotoTreatment(page);
  await workflowFilterTreatmentHistory(page, { date: batchOut.sentAt });
  const { sectionOut, sectionHistory } = getTreatmentLocators(page);
  const tableBatch = getTableTreatmentBatch(page, batchOut.sentAt);
  const [firstShipment, secondShipment] = batchOut.treatmentShipments;
  expect(
    secondShipment.pendingQuantity,
    "Wrong test set up: The shipment should be received in two times",
  ).toBeGreaterThan(1);

  await test.step("receive the whole first shipment and part of the second one at once", async () => {
    // The plus button fills in every pending part of the shipment, the other one is typed
    const firstRowBefore = getTableRowByTestId(tableBatch, firstShipment.id);
    await firstRowBefore.getByTestId("button-receive-all-pending").click();
    await expect(getEditableCellById(firstRowBefore, "receiveQuantity")).toHaveValue(
      String(firstShipment.pendingQuantity),
    );
    await expect(firstRowBefore.getByTestId("button-receive-all-pending")).toHaveAttribute("data-clickable", "false");
    await workflowReceiveFromTreatment(page, batchOut.sentAt, [
      { quantity: 1, treatmentShipmentId: secondShipment.id },
    ]);

    const newReceptions = await getNewTreatmentReceptions();
    expect(newReceptions.map(({ treatmentShipmentId, quantity }) => ({ quantity, treatmentShipmentId }))).toEqual([
      { quantity: firstShipment.pendingQuantity, treatmentShipmentId: firstShipment.id },
      { quantity: 1, treatmentShipmentId: secondShipment.id },
    ]);
    expect(newReceptions[0].receivedAt.getTime()).toBe(newReceptions[1].receivedAt.getTime());

    const firstRow = getTableRowByTestId(tableBatch, firstShipment.id);
    await expect(firstRow.getByTestId("pendingQuantity")).toHaveText("0");
    await expect(firstRow.getByTestId("receiveQuantity").getByTestId("editable-cell-input")).toHaveCount(0);
    await expect(firstRow.getByTestId("button-receive-all-pending")).toHaveCount(0);
    const secondRow = getTableRowByTestId(tableBatch, secondShipment.id);
    await expect(secondRow.getByTestId("receivedQuantity")).toHaveText(String(secondShipment.receivedQuantity + 1));
    await expect(secondRow.getByTestId("pendingQuantity")).toHaveText(String(secondShipment.pendingQuantity - 1));
    await expect(secondRow.getByTestId(`div-treatment-reception-${newReceptions[1].id}`)).toBeVisible();
    // Once some parts came back, the shipment can not be deleted
    await expect(secondRow.getByTestId("button-delete")).toHaveCount(0);
    await expect(sectionOut.getByTestId(`table-treatment-batch-${batchOut.sentAt.getTime()}`)).toBeVisible();
  });

  await test.step("receive the rest, the batch moves to the history", async () => {
    await workflowReceiveFromTreatment(page, batchOut.sentAt, [
      { quantity: secondShipment.pendingQuantity - 1, treatmentShipmentId: secondShipment.id },
    ]);
    await expect(sectionHistory.getByTestId(`table-treatment-batch-${batchOut.sentAt.getTime()}`)).toBeVisible();
    await expect(sectionOut.getByTestId(`table-treatment-batch-${batchOut.sentAt.getTime()}`)).toHaveCount(0);
    await expect(sectionOut).toContainText(NO_PARTS_IN_TREATMENT_MESSAGE);
    await expect(getButtonReceiveTreatment(tableBatch)).toHaveCount(0);
  });
});

test("undo a shipment and a reception", async ({ page, db }) => {
  await gotoTreatment(page);
  await workflowFilterTreatmentHistory(page, { date: batchReceived.sentAt });
  const { tablePending, sectionOut, sectionHistory } = getTreatmentLocators(page);
  const tableBatchOut = getTableTreatmentBatch(page, batchOut.sentAt);
  const shipmentWithoutReceptions = batchOut.treatmentShipments.find(
    (shipment) => shipment.treatmentReceptions.length === 0,
  )!;
  const shipmentWithReceptions = batchOut.treatmentShipments.find(
    (shipment) => shipment.treatmentReceptions.length > 0,
  )!;

  await test.step("deleting a shipment puts its parts back as pending to send", async () => {
    const pendingRow = getTableRowByTestId(tablePending, shipmentWithoutReceptions.productionOrderId!);
    const unsentBefore = Number(await pendingRow.getByTestId("unsentQuantity").textContent());

    await openAndConfirmAlertDialog(
      page,
      getTableRowByTestId(tableBatchOut, shipmentWithoutReceptions.id).getByTestId("button-delete"),
      "dialog-delete-model-content",
    );

    await expect(getTableRowByTestId(tableBatchOut, shipmentWithoutReceptions.id)).toHaveCount(0);
    await expect(pendingRow.getByTestId("unsentQuantity")).toHaveText(
      String(unsentBefore + shipmentWithoutReceptions.quantity),
    );
    expect(
      await db
        .select()
        .from(dbTableTreatmentShipment)
        .where(eq(dbTableTreatmentShipment.id, shipmentWithoutReceptions.id)),
    ).toHaveLength(0);
  });

  await test.step("deleting the receptions of a shipment lets it be deleted", async () => {
    const row = getTableRowByTestId(tableBatchOut, shipmentWithReceptions.id);
    for (const reception of shipmentWithReceptions.treatmentReceptions) {
      await openAndConfirmAlertDialog(
        page,
        row.getByTestId(`div-treatment-reception-${reception.id}`).getByTestId("button-delete-reception"),
        "dialog-delete-model-content",
      );
      await expect(row.getByTestId(`div-treatment-reception-${reception.id}`)).toHaveCount(0);
    }
    await expect(row.getByTestId("receivedQuantity")).toHaveText("0");
    await expect(row.getByTestId("pendingQuantity")).toHaveText(String(shipmentWithReceptions.quantity));
    await expect(row.getByTestId("button-delete")).toBeVisible();
  });

  await test.step("deleting a reception of a received batch takes it back out", async () => {
    const reception = batchReceived.treatmentShipments[0].treatmentReceptions[0];
    const tableBatchReceived = sectionHistory.getByTestId(`table-treatment-batch-${batchReceived.sentAt.getTime()}`);
    await openAndConfirmAlertDialog(
      page,
      tableBatchReceived.getByTestId(`div-treatment-reception-${reception.id}`).getByTestId("button-delete-reception"),
      "dialog-delete-model-content",
    );
    await expect(sectionOut.getByTestId(`table-treatment-batch-${batchReceived.sentAt.getTime()}`)).toBeVisible();
    await expect(sectionHistory.getByTestId(`table-treatment-batch-${batchReceived.sentAt.getTime()}`)).toHaveCount(0);
  });
});

test(
  "the server rejects what changed since the page was loaded and receiving more parts than there are",
  { annotation: TestAnnotations.NonEmptyErrorsLogFile },
  async ({ page, db }) => {
    const pending = pendingTreatmentProductionOrder.productionOrder;
    const otherPending = partiallySentProductionOrder.productionOrder;
    const sellOrderLinePending = pendingProductionOrders.find(
      ({ productionOrder }) =>
        productionOrder.sellOrderLineId !== null && ![pending.id, otherPending.id].includes(productionOrder.id),
    )?.productionOrder;
    expect(
      sellOrderLinePending,
      "Wrong test set up: An order of a sell order line should be pending to send",
    ).toBeDefined();
    const shipmentOut = batchOut.treatmentShipments.find((shipment) => shipment.pendingQuantity > 0)!;
    const shipmentWithoutReceptions = batchOut.treatmentShipments.find(
      (shipment) => shipment.treatmentReceptions.length === 0,
    )!;
    expect(
      shipmentWithoutReceptions,
      "Wrong test set up: A shipment of the batch out should have no receptions",
    ).toBeDefined();
    // The part received from it meanwhile must not receive the whole batch, or the batch leaves the parts out
    expect(
      batchOut.treatmentShipments.some(
        (shipment) => shipment.pendingQuantity > (shipment.id === shipmentWithoutReceptions.id ? 1 : 0),
      ),
      "Wrong test set up: The batch out should keep parts out after receiving one of the shipment without receptions",
    ).toBe(true);
    const setPartCoating = async (partId: number, coatingId: number | null) => {
      await db.update(dbTablePart).set({ coatingId }).where(eq(dbTablePart.id, partId));
    };

    await test.step("sending parts that changed meanwhile", async () => {
      const pendingPart = mockParts.find((part) => part.id === pending.partId)!;
      await gotoTreatment(page);
      await holdRequestWhile({
        page,
        procedurePath: "treatment.send",
        send: async () =>
          workflowSendToTreatment(
            page,
            [{ productionOrderId: pending.id, quantity: 1 }],
            `El Artículo de la Orden de producción ${pending.id} no lleva tratamiento`,
          ),
        meanwhile: async () => setPartCoating(pendingPart.id, null),
      });
      await setPartCoating(pendingPart.id, pendingPart.coatingId);

      await gotoTreatment(page);
      await holdRequestWhile({
        page,
        procedurePath: "treatment.sendPart",
        send: async () =>
          workflowSendPartToTreatment(
            page,
            { partId: coatedPart.id, quantity: 1 },
            `El Artículo "${coatedPart.description}" no lleva tratamiento`,
          ),
        meanwhile: async () => setPartCoating(coatedPart.id, null),
      });
      await setPartCoating(coatedPart.id, coatedPart.coatingId);

      // A single wrong order rejects the whole batch
      await gotoTreatment(page);
      await holdRequestWhile({
        page,
        procedurePath: "treatment.send",
        send: async () =>
          workflowSendToTreatment(
            page,
            [
              { productionOrderId: pending.id, quantity: 1 },
              { productionOrderId: otherPending.id, quantity: 1 },
            ],
            translatedEnums.ProductionOrderStatus[ProductionOrderStatus.Deleted],
          ),
        meanwhile: async () => {
          await db
            .update(dbTableProductionOrder)
            .set({ deletedAt: new Date() })
            .where(eq(dbTableProductionOrder.id, otherPending.id));
        },
      });

      await gotoTreatment(page);
      await holdRequestWhile({
        page,
        procedurePath: "treatment.send",
        send: async () =>
          workflowSendToTreatment(
            page,
            [{ productionOrderId: sellOrderLinePending!.id, quantity: 1 }],
            translatedEnums.ProductionOrderStatus[ProductionOrderStatus.SellOrderDeleted],
          ),
        meanwhile: async () => {
          const { sellOrderId } = getMockSellOrderLineById(sellOrderLinePending!.sellOrderLineId!)!;
          await db.update(dbTableSellOrder).set({ deletedAt: new Date() }).where(eq(dbTableSellOrder.id, sellOrderId));
        },
      });

      expect(await getNewTreatmentShipments()).toHaveLength(0);
    });

    await test.step("the page shows the error and keeps the typed quantities", async () => {
      await gotoTreatment(page);
      const row = getTableRowByTestId(getTableTreatmentBatch(page, batchOut.sentAt), shipmentOut.id);
      await workflowReceiveFromTreatment(
        page,
        batchOut.sentAt,
        [{ quantity: shipmentOut.pendingQuantity + 1, treatmentShipmentId: shipmentOut.id }],
        `solo tiene ${shipmentOut.pendingQuantity} piezas pendientes de recibir`,
      );
      await expect(getEditableCellById(row, "receiveQuantity")).toHaveValue(String(shipmentOut.pendingQuantity + 1));
      await expect(row.getByTestId("pendingQuantity")).toHaveText(String(shipmentOut.pendingQuantity));
      expect(await getNewTreatmentReceptions()).toHaveLength(0);
    });

    await test.step("deleting shipments and receptions that changed meanwhile", async () => {
      await gotoTreatment(page);
      await holdRequestWhile({
        page,
        procedurePath: "treatment.deleteShipment",
        send: async () =>
          workflowDeleteTreatmentShipment(
            page,
            batchOut.sentAt,
            shipmentWithoutReceptions.id,
            "El envío ya tiene piezas recibidas",
          ),
        meanwhile: async () => {
          await db
            .insert(dbTableTreatmentReception)
            .values({ quantity: 1, receivedAt: new Date(), treatmentShipmentId: shipmentWithoutReceptions.id });
        },
      });
      const [reception] = await getNewTreatmentReceptions();

      await gotoTreatment(page);
      await expect(
        getTreatmentLocators(page)
          .sectionOut.getByTestId(`table-treatment-batch-${batchOut.sentAt.getTime()}`)
          .getByTestId(`div-treatment-reception-${reception.id}`),
      ).toBeVisible();
      await holdRequestWhile({
        page,
        procedurePath: "treatment.deleteReception",
        send: async () =>
          workflowDeleteTreatmentReception(
            page,
            batchOut.sentAt,
            reception.id,
            `Recepción del tratamiento con ID ${reception.id} no encontrada`,
          ),
        meanwhile: async () => {
          await db.delete(dbTableTreatmentReception).where(eq(dbTableTreatmentReception.id, reception.id));
        },
      });

      await gotoTreatment(page);
      await holdRequestWhile({
        page,
        procedurePath: "treatment.deleteShipment",
        send: async () =>
          workflowDeleteTreatmentShipment(
            page,
            batchOut.sentAt,
            shipmentWithoutReceptions.id,
            `Envío al tratamiento con ID ${shipmentWithoutReceptions.id} no encontrado`,
          ),
        meanwhile: async () => {
          await db
            .delete(dbTableTreatmentShipment)
            .where(eq(dbTableTreatmentShipment.id, shipmentWithoutReceptions.id));
        },
      });
    });

    await test.step("receiving a shipment deleted meanwhile", async () => {
      await workflowSendPartToTreatment(page, { partId: coatedPart.id, quantity: 1 });
      const [shipment] = await getNewTreatmentShipments();
      await holdRequestWhile({
        page,
        procedurePath: "treatment.receive",
        send: async () =>
          workflowReceiveFromTreatment(
            page,
            shipment.sentAt,
            [{ quantity: 1, treatmentShipmentId: shipment.id }],
            `Envío al tratamiento con ID ${shipment.id} no encontrado`,
          ),
        meanwhile: async () => {
          await db.delete(dbTableTreatmentShipment).where(eq(dbTableTreatmentShipment.id, shipment.id));
        },
      });
      expect(await getNewTreatmentReceptions()).toHaveLength(0);
    });
  },
);

test("the plus buttons fill in every pending part and turn into a check", async ({ page }) => {
  await gotoTreatment(page);
  const { tablePending } = getTreatmentLocators(page);
  const shipmentOut = batchOut.treatmentShipments.find((shipment) => shipment.pendingQuantity > 1)!;

  await test.step("the parts to send", async () => {
    await assertFillPendingButton(
      getTableRowByTestId(tablePending, pendingTreatmentProductionOrder.productionOrder.id),
      {
        buttonTestId: "button-send-all-pending",
        inputTestId: "sendQuantity",
        pendingQuantity: pendingTreatmentProductionOrder.unsentQuantity,
      },
    );
    // The other rows keep their own button
    await expect(
      getTableRowByTestId(tablePending, partiallySentProductionOrder.productionOrder.id).getByTestId(
        "button-send-all-pending",
      ),
    ).toHaveAttribute("data-clickable", "true");
  });

  await test.step("the parts to receive", async () => {
    const tableBatch = getTableTreatmentBatch(page, batchOut.sentAt);
    await assertFillPendingButton(getTableRowByTestId(tableBatch, shipmentOut.id), {
      buttonTestId: "button-receive-all-pending",
      inputTestId: "receiveQuantity",
      pendingQuantity: shipmentOut.pendingQuantity,
    });
    for (const shipment of batchOut.treatmentShipments.filter(
      ({ id, pendingQuantity }) => id !== shipmentOut.id && pendingQuantity > 0,
    )) {
      await expect(
        getTableRowByTestId(tableBatch, shipment.id).getByTestId("button-receive-all-pending"),
      ).toHaveAttribute("data-clickable", "true");
    }
  });

  expect(await getNewTreatmentShipments()).toHaveLength(0);
  expect(await getNewTreatmentReceptions()).toHaveLength(0);
});

test("more parts than the pending ones can be sent", async ({ page }) => {
  await gotoTreatment(page);
  const { tablePending, sectionOut } = getTreatmentLocators(page);
  const quantities = [
    { pending: pendingTreatmentProductionOrder, extraQuantity: 1 },
    { pending: partiallySentProductionOrder, extraQuantity: 2 },
  ].map(({ pending, extraQuantity }) => ({
    productionOrderId: pending.productionOrder.id,
    quantity: pending.unsentQuantity + extraQuantity,
  }));

  await workflowSendToTreatment(page, quantities);

  const newShipments = await getNewTreatmentShipments();
  expect(
    newShipments
      .map(({ productionOrderId, quantity }) => ({ productionOrderId: productionOrderId!, quantity }))
      .sort((a, b) => a.productionOrderId - b.productionOrderId),
  ).toEqual([...quantities].sort((a, b) => a.productionOrderId - b.productionOrderId));

  const tableNewBatch = sectionOut.getByTestId(`table-treatment-batch-${newShipments[0].sentAt.getTime()}`);
  await assertTableRowCount(tableNewBatch, quantities.length);
  for (const shipment of newShipments) {
    // Every part sent leaves the pending table, the extra ones too
    await expect(getTableRowByTestId(tablePending, shipment.productionOrderId!)).toHaveCount(0);
    await expect(getTableRowByTestId(tableNewBatch, shipment.id).getByTestId("pendingQuantity")).toHaveText(
      String(shipment.quantity),
    );
    expect(await dbGetProductionOrderStatus((await getProductionOrderById(shipment.productionOrderId!))!)).toBe(
      ProductionOrderStatus.InTreatment,
    );
  }
});

test("a batch with more parts than produced is completed once received", async ({ page }) => {
  await gotoTreatment(page);
  const pending = pendingTreatmentProductionOrder;
  const quantity = pending.unsentQuantity + 1;
  await workflowSendToTreatment(page, [{ productionOrderId: pending.productionOrder.id, quantity }]);
  const [shipment] = await getNewTreatmentShipments();

  await workflowReceiveFromTreatment(page, shipment.sentAt, [{ quantity, treatmentShipmentId: shipment.id }]);

  expect((await getNewTreatmentReceptions()).map((reception) => reception.quantity)).toEqual([quantity]);
  await expect(
    getTreatmentLocators(page).sectionOut.getByTestId(`table-treatment-batch-${shipment.sentAt.getTime()}`),
  ).toHaveCount(0);
  await expect(getTableRowByTestId(getTreatmentLocators(page).tablePending, pending.productionOrder.id)).toHaveCount(0);
  expect(await dbGetProductionOrderStatus((await getProductionOrderById(pending.productionOrder.id))!)).toBe(
    ProductionOrderStatus.Completed,
  );
});

test("the status of a production order follows its parts through the treatment", async ({ page, db }) => {
  const productionOrderId = pendingTreatmentProductionOrder.productionOrder.id;
  const produced = pendingTreatmentProductionOrder.producedQuantity;
  expect(produced, "Wrong test set up: The order should be sent in two times").toBeGreaterThan(1);
  const firstQuantity = 1;

  const { partId } = pendingTreatmentProductionOrder.productionOrder;
  const send = async (quantity: number) =>
    (
      await db
        .insert(dbTableTreatmentShipment)
        .values({ partId, productionOrderId, quantity, sentAt: new Date() })
        .returning()
    )[0];
  const receive = async (treatmentShipmentId: number, quantity: number) =>
    db.insert(dbTableTreatmentReception).values({ quantity, receivedAt: new Date(), treatmentShipmentId });

  await test.step("produced and nothing sent, it is pending of treatment", async () => {
    await assertProductionOrderStatus(page, productionOrderId, ProductionOrderStatus.PendingTreatment);
  });

  const firstShipment = await send(firstQuantity);
  await test.step("some parts out and some still to send, it is in treatment", async () => {
    await assertProductionOrderStatus(page, productionOrderId, ProductionOrderStatus.InTreatment);
  });

  await receive(firstShipment.id, firstQuantity);
  await test.step("the parts sent are back but some are still to send, it is pending of treatment", async () => {
    await assertProductionOrderStatus(page, productionOrderId, ProductionOrderStatus.PendingTreatment);
  });

  const secondShipment = await send(produced - firstQuantity);
  await test.step("every part sent and some still out, it is in treatment", async () => {
    await assertProductionOrderStatus(page, productionOrderId, ProductionOrderStatus.InTreatment);
  });

  await receive(secondShipment.id, produced - firstQuantity);
  await test.step("every part back, it is completed", async () => {
    await assertProductionOrderStatus(page, productionOrderId, ProductionOrderStatus.Completed);
  });

  await test.step("producing more parts takes it back to pending of treatment", async () => {
    await db.insert(dbTablePartProduction).values({
      date: MOCK_INITIAL_DATE,
      machineId: mockMachines[0].id,
      productionOrderId,
      quantity: 2,
    });
    await assertProductionOrderStatus(page, productionOrderId, ProductionOrderStatus.PendingTreatment);
  });
});

test("the status of a sell order line follows the status of its production orders", async ({ page, db }) => {
  const sellOrderLine = mockSellOrderLines.find((line) =>
    mockProductionOrders.some(
      (productionOrder) =>
        productionOrder.sellOrderLineId === line.id && productionOrder.id === inProductionProductionOrder.id,
    ),
  )!;
  expect(sellOrderLine.pendingQuantity, "Wrong test set up: The line should be pending").toBeGreaterThan(0);
  const productionOrder = inProductionProductionOrder;
  const machine = mockMachines.find((mockMachine) => mockMachine.activeProductionOrderId === productionOrder.id)!;
  const outShipment = mockTreatmentShipments.find(
    (shipment) =>
      shipment.productionOrderId === productionOrder.id &&
      !mockTreatmentReceptions.some((reception) => reception.treatmentShipmentId === shipment.id),
  )!;
  const rowSellOrderLine = getTableRowByTestId(
    page.getByTestId("form-sell-order").getByTestId("table-sell-order-line"),
    sellOrderLine.id,
  );

  const assertLineStatus = async (expectedStatus: SellOrderLineStatus) => {
    const dbSellOrderLine = (await getSellOrderLineById(sellOrderLine.id))!;
    expect(await getSellOrderLineStatus({ sellOrderLine: dbSellOrderLine })).toBe(expectedStatus);

    const { statusText, tooltipDescription } = getSellOrderLineStatusDisplay(expectedStatus);
    await page.goto(`/sell-order/${sellOrderLine.sellOrderId}`);
    const status = rowSellOrderLine.getByTestId("status");
    await expect(status).toHaveText(statusText);
    // Some statuses share their text, the description tells them apart
    await status.getByRole("button").hover();
    await expect(page.getByText(tooltipDescription!, { exact: true })).toBeVisible();
  };

  await test.step("a machine running its production order, it is in production", async () => {
    await assertLineStatus(SellOrderLineStatus.InProduction);
  });

  await db.update(dbTableMachine).set({ activeProductionOrderId: null }).where(eq(dbTableMachine.id, machine.id));
  await test.step("stopped before its quantity, it is pending of production", async () => {
    await assertLineStatus(SellOrderLineStatus.ProductionPending);
  });

  await db.insert(dbTablePartProduction).values({
    date: MOCK_INITIAL_DATE,
    machineId: machine.id,
    productionOrderId: productionOrder.id,
    quantity: productionOrder.quantity!,
  });
  await test.step("produced with parts out in the treatment, it is in treatment", async () => {
    await assertLineStatus(SellOrderLineStatus.InTreatment);
  });

  await db
    .insert(dbTableTreatmentReception)
    .values({ quantity: outShipment.quantity, receivedAt: new Date(), treatmentShipmentId: outShipment.id });
  await test.step("parts back but some still to send, it is pending of treatment", async () => {
    await assertLineStatus(SellOrderLineStatus.PendingTreatment);
  });

  const unsentQuantity =
    (await getProductionOrderProducedQuantity(productionOrder.id)) -
    getMockTreatmentQuantities(productionOrder.id).sentQuantity;
  const lastShipment = (
    await db
      .insert(dbTableTreatmentShipment)
      .values({
        partId: productionOrder.partId,
        productionOrderId: productionOrder.id,
        quantity: unsentQuantity,
        sentAt: new Date(),
      })
      .returning()
  )[0];
  await db
    .insert(dbTableTreatmentReception)
    .values({ quantity: unsentQuantity, receivedAt: new Date(), treatmentShipmentId: lastShipment.id });
  await test.step("every part back from the treatment, it is produced", async () => {
    await assertLineStatus(SellOrderLineStatus.ProductionFinished);
  });

  const otherProductionOrder = (
    await db
      .insert(dbTableProductionOrder)
      .values({
        createdAt: MOCK_INITIAL_DATE,
        partId: productionOrder.partId,
        quantity: 1,
        sellOrderLineId: sellOrderLine.id,
      })
      .returning()
  )[0];
  await test.step("another production order still pending, it is pending of production", async () => {
    await assertLineStatus(SellOrderLineStatus.ProductionPending);
  });

  await db
    .update(dbTableProductionOrder)
    .set({ deletedAt: MOCK_INITIAL_DATE })
    .where(eq(dbTableProductionOrder.id, otherProductionOrder.id));
  await test.step("a deleted production order does not count", async () => {
    await assertLineStatus(SellOrderLineStatus.ProductionFinished);
  });
});

test("a line whose production orders are all deleted is pending", async ({ page, db }) => {
  const sellOrderLine = mockSellOrderLines.find(
    (line) =>
      line.deletedAt === null &&
      line.pendingQuantity > 0 &&
      line.partReferenceId !== null &&
      !mockProductionOrders.some((productionOrder) => productionOrder.sellOrderLineId === line.id),
  )!;
  expect(sellOrderLine, "Wrong test set up: Some pending line should have no production order").toBeDefined();
  await db.insert(dbTableProductionOrder).values({
    createdAt: MOCK_INITIAL_DATE,
    deletedAt: MOCK_INITIAL_DATE,
    partId: mockParts[0].id,
    quantity: 1,
    sellOrderLineId: sellOrderLine.id,
  });

  expect(await getSellOrderLineStatus({ sellOrderLine })).toBe(SellOrderLineStatus.Pending);
  await page.goto(`/sell-order/${sellOrderLine.sellOrderId}`);
  const status = getTableRowByTestId(
    page.getByTestId("form-sell-order").getByTestId("table-sell-order-line"),
    sellOrderLine.id,
  ).getByTestId("status");
  await status.getByRole("button").hover();
  await expect(
    page.getByText(getSellOrderLineStatusDisplay(SellOrderLineStatus.Pending).tooltipDescription!, { exact: true }),
  ).toBeVisible();
});

test("parts without a production order can be sent to the treatment", async ({ page }) => {
  await gotoTreatment(page);
  const quantity = 4;

  await workflowSendPartToTreatment(page, { partId: coatedPart.id, quantity });

  const [shipment] = await getNewTreatmentShipments();
  expect(shipment).toMatchObject({ partId: coatedPart.id, productionOrderId: null, quantity });
  const row = getTableRowByTestId(
    getTreatmentLocators(page).sectionOut.getByTestId(`table-treatment-batch-${shipment.sentAt.getTime()}`),
    shipment.id,
  );
  await expect(row.getByTestId("productionOrderId")).toHaveText(WITHOUT_ORDER_LABEL);
  await expect(row.getByTestId("description")).toHaveText(coatedPart.description);
  await expect(row.getByTestId("pendingQuantity")).toHaveText(String(quantity));

  await workflowReceiveFromTreatment(page, shipment.sentAt, [{ quantity, treatmentShipmentId: shipment.id }]);
  expect((await getNewTreatmentReceptions()).map((reception) => reception.quantity)).toEqual([quantity]);
});
