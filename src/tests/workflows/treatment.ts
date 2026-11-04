import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { asc, gt } from "drizzle-orm";

import db from "@/db";
import { dbTableTreatmentReception, dbTableTreatmentShipment } from "@/db/schema";
import {
  mockPartProduction,
  mockParts,
  mockProductionOrders,
  mockTreatmentReceptions,
  mockTreatmentShipments,
} from "@/tests/mock-data";
import { openAndConfirmAlertDialog } from "@/tests/utils/components/alert-dialog";
import { selectDateInputDate } from "@/tests/utils/components/date-input";
import { openPartPicker } from "@/tests/utils/components/picker";
import { getEditableCellById, getTableRowByTestId } from "@/tests/utils/components/table";
import { expectSingleToast } from "@/tests/utils/components/toast";
import {
  getMockSellOrderById,
  getMockSellOrderLineById,
  getMockTreatmentQuantities,
} from "@/tests/utils/mock-data-utils";
import type { BaseProductionOrder } from "@/types/production-order";

export function getTreatmentLocators(page: Page) {
  return {
    sectionHistory: page.getByTestId("section-treatment-history"),
    sectionOut: page.getByTestId("section-treatment-out"),
    tablePending: page.getByTestId("table-treatment-pending"),
  };
}

export function getTableTreatmentBatch(page: Page, sentAt: Date) {
  return page.getByTestId(`table-treatment-batch-${sentAt.getTime()}`);
}

// The button is in the header of the table, which is outside the element with the test id of the table
export function getButtonReceiveTreatment(tableBatch: Locator) {
  return tableBatch.locator("xpath=ancestor::*[@role='radiogroup'][1]").getByTestId("button-receive-treatment");
}

export function getMockProducedQuantity(productionOrderId: number) {
  return mockPartProduction
    .filter((partProduction) => partProduction.productionOrderId === productionOrderId)
    .reduce((total, partProduction) => total + partProduction.quantity, 0);
}

function isMockProductionOrderDeleted(productionOrder: BaseProductionOrder) {
  const sellOrderLine =
    productionOrder.sellOrderLineId !== null ? getMockSellOrderLineById(productionOrder.sellOrderLineId) : undefined;
  return (
    productionOrder.deletedAt !== null ||
    (sellOrderLine !== undefined &&
      (sellOrderLine.deletedAt !== null || getMockSellOrderById(sellOrderLine.sellOrderId)?.deletedAt != null))
  );
}

export function isMockCoatedProductionOrder(productionOrder: BaseProductionOrder) {
  return mockParts.find((part) => part.id === productionOrder.partId)?.coatingId != null;
}

// The production orders with produced parts of a coated part still to send, worked out from the mock data alone
export function getMockTreatmentPendingProductionOrders() {
  return mockProductionOrders
    .filter((productionOrder) => isMockCoatedProductionOrder(productionOrder))
    .filter((productionOrder) => !isMockProductionOrderDeleted(productionOrder))
    .map((productionOrder) => {
      const producedQuantity = getMockProducedQuantity(productionOrder.id);
      const { sentQuantity } = getMockTreatmentQuantities(productionOrder.id);
      return { productionOrder, producedQuantity, sentQuantity, unsentQuantity: producedQuantity - sentQuantity };
    })
    .filter(({ unsentQuantity }) => unsentQuantity > 0);
}

export function getMockTreatmentBatches() {
  const sentAts = [...new Set(mockTreatmentShipments.map((shipment) => shipment.sentAt.getTime()))];
  return sentAts.map((sentAt) => {
    const treatmentShipments = mockTreatmentShipments
      .filter((shipment) => shipment.sentAt.getTime() === sentAt)
      .map((shipment) => {
        const treatmentReceptions = mockTreatmentReceptions.filter(
          (reception) => reception.treatmentShipmentId === shipment.id,
        );
        const receivedQuantity = treatmentReceptions.reduce((total, reception) => total + reception.quantity, 0);
        return {
          ...shipment,
          pendingQuantity: shipment.quantity - receivedQuantity,
          receivedQuantity,
          treatmentReceptions,
        };
      });
    return {
      isReceived: treatmentShipments.every((shipment) => shipment.pendingQuantity === 0),
      sentAt: new Date(sentAt),
      treatmentShipments,
    };
  });
}

export async function getNewTreatmentShipments() {
  return db
    .select()
    .from(dbTableTreatmentShipment)
    .where(gt(dbTableTreatmentShipment.id, mockTreatmentShipments.length))
    .orderBy(asc(dbTableTreatmentShipment.id));
}

export async function getNewTreatmentReceptions() {
  return db
    .select()
    .from(dbTableTreatmentReception)
    .where(gt(dbTableTreatmentReception.id, mockTreatmentReceptions.length))
    .orderBy(asc(dbTableTreatmentReception.id));
}

export async function workflowFilterTreatmentHistory(page: Page, { date, partId }: { date?: Date; partId?: number }) {
  const { sectionHistory } = getTreatmentLocators(page);
  if (date !== undefined) {
    await selectDateInputDate(page, sectionHistory.getByTestId("input-treatment-history-date"), date);
  }
  if (partId !== undefined) {
    const { dialogPickerPartContent, tablePickerPart } = await openPartPicker(
      page,
      sectionHistory.getByTestId("picker-treatment-history-part"),
    );
    await getTableRowByTestId(tablePickerPart, partId).getByTestId("button-success").click();
    await expect(dialogPickerPartContent).not.toBeVisible();
  }
}

// The plus button of a row fills in every pending part, and turns into a check that does nothing once that many are
// typed
export async function assertFillPendingButton(
  row: Locator,
  {
    buttonTestId,
    inputTestId,
    pendingQuantity,
  }: { buttonTestId: string; inputTestId: string; pendingQuantity: number },
) {
  const button = row.getByTestId(buttonTestId);
  const input = getEditableCellById(row, inputTestId);
  const assertIsFilled = async (isFilled: boolean) => {
    await expect(button).toHaveAttribute("data-clickable", String(!isFilled));
    await expect(button.locator(isFilled ? "svg.lucide-check" : "svg.lucide-plus")).toBeVisible();
    await expect(button.locator(isFilled ? "svg.lucide-plus" : "svg.lucide-check")).toHaveCount(0);
  };

  await assertIsFilled(false);
  for (const [quantity, isFilled] of [
    [pendingQuantity - 1, false],
    [pendingQuantity, true],
    [pendingQuantity + 1, true],
  ] as const) {
    await input.clear();
    if (quantity > 0) {
      await input.pressSequentially(String(quantity));
      await expect(input).toHaveValue(String(quantity));
    }
    await assertIsFilled(isFilled);
    // Once filled, a click keeps what is typed
    if (isFilled) {
      await button.click();
      await expect(input).toHaveValue(String(quantity));
    }
  }
  await input.clear();
  await expect(input).toHaveValue("");
  await assertIsFilled(false);

  await button.click();
  await expect(input).toHaveValue(String(pendingQuantity));
  await assertIsFilled(true);
}

// Fills the quantity of each production order and sends them in a single batch
export async function workflowSendToTreatment(
  page: Page,
  quantities: Array<{ productionOrderId: number; quantity: number }>,
  expectedErrorMessage?: string,
) {
  const { tablePending } = getTreatmentLocators(page);
  for (const { productionOrderId, quantity } of quantities) {
    const input = getEditableCellById(getTableRowByTestId(tablePending, productionOrderId), "sendQuantity");
    await input.pressSequentially(String(quantity));
    await expect(input).toHaveValue(String(quantity));
  }
  await page.getByTestId("button-send-treatment").click();
  await expectSingleToast(page, expectedErrorMessage);
}

export async function workflowSendPartToTreatment(
  page: Page,
  { partId, quantity }: { partId: number; quantity: number },
  expectedErrorMessage?: string,
) {
  await page.getByTestId("button-send-part-treatment").click();
  const dialog = page.getByTestId("dialog-send-part-treatment");
  const { dialogPickerPartContent, tablePickerPart } = await openPartPicker(
    page,
    dialog.getByTestId("picker-send-part-treatment"),
  );
  await getTableRowByTestId(tablePickerPart, partId).getByTestId("button-success").click();
  await expect(dialogPickerPartContent).not.toBeVisible();
  await dialog.getByTestId("input-send-part-treatment-quantity").pressSequentially(String(quantity));
  await dialog.getByTestId("button-confirm-send-part-treatment").click();
  await expectSingleToast(page, expectedErrorMessage);
  if (expectedErrorMessage === undefined) {
    await expect(dialog).not.toBeVisible();
  }
}

export async function workflowReceiveFromTreatment(
  page: Page,
  sentAt: Date,
  quantities: Array<{ treatmentShipmentId: number; quantity: number }>,
  expectedErrorMessage?: string,
) {
  const tableBatch = getTableTreatmentBatch(page, sentAt);
  for (const { treatmentShipmentId, quantity } of quantities) {
    const input = getEditableCellById(getTableRowByTestId(tableBatch, treatmentShipmentId), "receiveQuantity");
    await input.pressSequentially(String(quantity));
    await expect(input).toHaveValue(String(quantity));
  }
  await getButtonReceiveTreatment(tableBatch).click();
  await expectSingleToast(page, expectedErrorMessage);
}

export async function workflowDeleteTreatmentShipment(
  page: Page,
  sentAt: Date,
  treatmentShipmentId: number,
  expectedErrorMessage?: string,
) {
  await openAndConfirmAlertDialog(
    page,
    getTableRowByTestId(getTableTreatmentBatch(page, sentAt), treatmentShipmentId).getByTestId("button-delete"),
    "dialog-delete-model-content",
  );
  await expectSingleToast(page, expectedErrorMessage);
}

export async function workflowDeleteTreatmentReception(
  page: Page,
  sentAt: Date,
  treatmentReceptionId: number,
  expectedErrorMessage?: string,
) {
  await openAndConfirmAlertDialog(
    page,
    getTableTreatmentBatch(page, sentAt)
      .getByTestId(`div-treatment-reception-${treatmentReceptionId}`)
      .getByTestId("button-delete-reception"),
    "dialog-delete-model-content",
  );
  await expectSingleToast(page, expectedErrorMessage);
}
