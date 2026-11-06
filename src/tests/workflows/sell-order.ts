import fs from "node:fs";

import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { getSellOrderById } from "@/db/functions/sell-order";
import { getSellOrderLineById } from "@/db/functions/sell-order-line";
import { getSellOrderPath } from "@/files/sell-order";
import { FILE_LABEL } from "@/messages/common";
import { openAndConfirmAlertDialog } from "@/tests/utils/components/alert-dialog";
import { setInputFiles } from "@/tests/utils/components/file-input";
import { InputElementType, assertFormLoaded, getFormInputByLabel } from "@/tests/utils/components/form";
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

export async function workflowOpenSellOrder(page: Page, sellOrderId: number) {
  await page.goto(`/sell-order/${sellOrderId}`);
  const formSellOrder = page.getByTestId("form-sell-order");
  await assertFormLoaded(formSellOrder);
  return formSellOrder;
}

export async function workflowSubmitSellOrder(page: Page) {
  const toasts = getToasts(page);
  await page.getByTestId("button-submit-form-sell-order").click();
  await expect(toasts).toHaveCount(1);
  expect(await getToastType(toasts.first())).toBe(ToastType.Success);
  await clearToasts(page);
}

export async function workflowUploadSellOrderFile(page: Page, filePath: string) {
  await setInputFiles(page, getFormInputByLabel(page, FILE_LABEL, InputElementType.File), filePath);
  await workflowSubmitSellOrder(page);
}

export const getSellOrderFilePath = async (sellOrderId: number) =>
  getSellOrderPath({ checkIfFileExists: true, logErrors: false, sellOrderId });

export async function workflowOpenSellOrderFile(page: Page, buttonFile: Locator) {
  await expect(buttonFile).toBeEnabled();
  await buttonFile.click();
  const dialogFile = page.getByTestId("dialog-sell-order-file-content");
  await expect(dialogFile).toBeVisible();
  return dialogFile;
}

// The download goes through the same URL the PDF viewer loads, so it checks what the user sees
export async function workflowDownloadSellOrderFile(page: Page, dialogFile: Locator, sellOrderId: number) {
  const downloadPromise = page.waitForEvent("download");
  await dialogFile.getByTestId("button-download-sell-order-file").click();
  const download = await downloadPromise;

  const { fileUploadedAt } = (await getSellOrderById(sellOrderId))!;
  const url = new URL(download.url());
  expect(download.suggestedFilename()).toBe(`Pedido de venta ${sellOrderId}.pdf`);
  expect(url.pathname).toBe(`/api/files/sell-order/${sellOrderId}`);
  expect(url.searchParams.get("uploadedAt")).toBe(String(fileUploadedAt!.getTime()));
  expect(
    fs.readFileSync(await download.path()).equals(fs.readFileSync((await getSellOrderFilePath(sellOrderId))!)),
  ).toBe(true);
  return url.href;
}

export async function workflowDeleteSellOrderFile(
  page: Page,
  dialogFile: Locator,
  expectedToastType = ToastType.Success,
) {
  const toasts = getToasts(page);
  await openAndConfirmAlertDialog(
    page,
    dialogFile.getByTestId("button-delete-sell-order-file"),
    "dialog-delete-model-content",
  );
  await expect(toasts).toHaveCount(1);
  expect(await getToastType(toasts.first())).toBe(expectedToastType);
  await clearToasts(page);
}

export async function workflowOpenCreateSellOrderLine(page: Page, sellOrderId: number) {
  await workflowOpenSellOrder(page, sellOrderId);

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
