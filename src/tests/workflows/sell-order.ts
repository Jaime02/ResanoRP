import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

import { getSellOrderById } from "@/db/functions/sell-order";
import { getSellOrderLineById } from "@/db/functions/sell-order-line";
import { openAndConfirmAlertDialog } from "@/tests/utils/components/alert-dialog";
import { assertFormLoaded } from "@/tests/utils/components/form";
import { openPartPicker } from "@/tests/utils/components/picker";
import { getTableRowByTestId } from "@/tests/utils/components/table";
import { clearToasts, getToastType, getToasts } from "@/tests/utils/components/toast";
import { ToastType } from "@/types";

export async function workflowDeleteSellOrder(page: Page, sellOrderId: number) {
  await page.goto(`/sell-order/${sellOrderId}`);

  let dbSellOrder = await getSellOrderById(sellOrderId);
  expect(dbSellOrder).toBeDefined();
  expect(dbSellOrder!.deletedAt).toBeNull();

  const buttonDeleteSellOrder = page.getByTestId("button-delete-sell-order");
  const buttonRestoreSellOrder = page.getByTestId("button-restore-sell-order");

  await expect(buttonDeleteSellOrder).toBeVisible();
  await expect(buttonDeleteSellOrder).toBeEnabled();

  await openAndConfirmAlertDialog(page, buttonDeleteSellOrder, "dialog-delete-model-content");
  const toasts = getToasts(page);
  await expect(toasts).toHaveCount(1);
  expect(await getToastType(toasts.first())).toBe(ToastType.Success);

  await expect(buttonDeleteSellOrder).toBeHidden();
  await expect(buttonRestoreSellOrder).toBeVisible();
  await expect(buttonRestoreSellOrder).toBeEnabled();

  dbSellOrder = await getSellOrderById(sellOrderId);
  expect(dbSellOrder!.deletedAt).not.toBeNull();
}

export async function workflowOpenCreateSellOrderLine(page: Page, sellOrderId: number) {
  await page.goto(`/sell-order/${sellOrderId}`);
  await assertFormLoaded(page.getByTestId("form-sell-order"));

  const buttonAddLine = page.getByTestId("button-add-sell-order-line");
  await expect(buttonAddLine).toBeVisible();
  await expect(buttonAddLine).toBeEnabled();
  await buttonAddLine.click();

  const dialogCreateSellOrderLine = page.getByTestId("dialog-create-sell-order-line");
  await assertFormLoaded(dialogCreateSellOrderLine);
  return dialogCreateSellOrderLine;
}

// The Pedido de venta has to be opened already, so the test can assert it before the Línea is deleted
export async function workflowDeleteSellOrderLine(page: Page, sellOrderLineId: number) {
  const toasts = getToasts(page);
  const rowSellOrderLine = getTableRowByTestId(page.getByTestId("table-sell-order-line"), sellOrderLineId);
  await expect(rowSellOrderLine).toBeVisible();

  await openAndConfirmAlertDialog(page, rowSellOrderLine.getByTestId("button-delete"), "dialog-delete-model-content");
  await expect(toasts).toHaveCount(1);
  expect(await getToastType(toasts.first())).toBe(ToastType.Success);
  await clearToasts(page);

  expect((await getSellOrderLineById(sellOrderLineId))?.deletedAt).toBeTruthy();
  return rowSellOrderLine;
}

export async function workflowOpenSellOrderLinePartPicker(page: Page, sellOrderId: number) {
  const dialogCreateSellOrderLine = await workflowOpenCreateSellOrderLine(page, sellOrderId);
  const { tablePickerPart } = await openPartPicker(page, dialogCreateSellOrderLine.getByTestId("picker-part"));
  return tablePickerPart;
}
