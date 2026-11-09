import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

import { getDeliveryNote, getSellOrderLinesByDeliveryNoteId } from "@/db/functions/delivery-note";
import { getDeliveryNoteLinesByDeliveryNoteId } from "@/db/functions/delivery-note-line";
import { getSellOrderLineById } from "@/db/functions/sell-order-line";
import { clampPendingQuantity } from "@/lib/sell-order-line";
import { ADD_PART_LABEL, CLIENT_LABEL, DESCRIPTION_LABEL, PRICE_LABEL, QUANTITY_LABEL } from "@/messages/common";
import { getTestId } from "@/tests/utils/components";
import { openAndConfirmAlertDialog } from "@/tests/utils/components/alert-dialog";
import {
  assertComboboxValue,
  clickInComboboxOption,
  openCombobox,
  selectComboboxOption,
} from "@/tests/utils/components/combobox";
import { InputElementType, assertFormLoaded, getFormInputByLabel } from "@/tests/utils/components/form";
import { getEditableCellById, getTableRowByTestId, getTableRows } from "@/tests/utils/components/table";
import { expectSingleToast } from "@/tests/utils/components/toast";
import type { BaseClient } from "@/types/client";

export async function workflowDeleteDeliveryNote(page: Page, deliveryNoteId: number) {
  await page.goto("/delivery-note");
  const rowDeliveryNote = getTableRowByTestId(page.getByTestId("table-delivery-note"), deliveryNoteId);
  await expect(rowDeliveryNote).toBeVisible();

  const affectedSellOrderLines = await getSellOrderLinesByDeliveryNoteId(deliveryNoteId);
  const deliveryNoteLines = await getDeliveryNoteLinesByDeliveryNoteId(deliveryNoteId);

  await openAndConfirmAlertDialog(page, rowDeliveryNote.getByTestId("button-delete"), "dialog-delete-model-content");

  await expect(rowDeliveryNote).not.toBeVisible();
  await expectSingleToast(page);
  const dbDeletedDeliveryNote = await getDeliveryNote({ id: deliveryNoteId });
  expect(dbDeletedDeliveryNote).toBeUndefined();

  expect((await getDeliveryNoteLinesByDeliveryNoteId(deliveryNoteId)).length).toBe(0);

  // The sell order lines get back what every line of the delivery note delivered of them, within their quantity
  for (const sellOrderLine of affectedSellOrderLines) {
    const deliveredQuantity = deliveryNoteLines
      .filter((deliveryNoteLine) => deliveryNoteLine.sellOrderLineId === sellOrderLine.id)
      .reduce((total, deliveryNoteLine) => total + deliveryNoteLine.quantity, 0);
    const dbSellOrderLine = await getSellOrderLineById(sellOrderLine.id);
    expect(dbSellOrderLine?.pendingQuantity).toBe(
      clampPendingQuantity(sellOrderLine.pendingQuantity + deliveredQuantity, sellOrderLine.quantity),
    );
  }
}

export async function workflowOpenEditDeliveryNote(page: Page, deliveryNoteId: number) {
  const dialogCreateEditDeliveryNote = page.getByTestId("dialog-create-edit-delivery-note");
  await page.goto(`/delivery-note?editDeliveryNoteId=${deliveryNoteId}`);
  await expect(dialogCreateEditDeliveryNote).toBeVisible();
  await assertFormLoaded(dialogCreateEditDeliveryNote);
  return dialogCreateEditDeliveryNote;
}

// Leaves the toast to the test, as the change may be rejected
export async function workflowEditDeliveryNoteLineQuantity(page: Page, deliveryNoteLineId: number, quantity: number) {
  const inputQuantity = getEditableCellById(
    getTableRowByTestId(
      page.getByTestId("dialog-create-edit-delivery-note").getByTestId("table-delivery-note-line"),
      deliveryNoteLineId,
    ),
    "quantity",
  );
  await inputQuantity.clear();
  await inputQuantity.pressSequentially(String(quantity));
  await inputQuantity.blur();
  return inputQuantity;
}

export async function workflowOpenCreateDeliveryNoteLine(page: Page) {
  const dialogCreateDeliveryNoteLine = page.getByTestId("dialog-create-delivery-note-line");
  await page.getByTestId("dialog-create-edit-delivery-note").getByRole("button", { name: ADD_PART_LABEL }).click();
  await expect(dialogCreateDeliveryNoteLine).toBeVisible();
  await assertFormLoaded(dialogCreateDeliveryNoteLine);
  return dialogCreateDeliveryNoteLine;
}

export async function workflowOpenCreateDeliveryNoteForClient(page: Page, client: BaseClient) {
  await page.goto("/create-delivery-note");
  await selectComboboxOption(
    page,
    getFormInputByLabel(page, CLIENT_LABEL, InputElementType.Combobox),
    client.name,
    String(client.id),
  );
  await expect(page.getByTestId("table-pending-sell-orders")).toBeVisible();
}

export async function workflowStageSingleSellOrderLine(page: Page, sellOrderLineId: number) {
  await getTableRowByTestId(page.getByTestId("table-pending-sell-orders"), sellOrderLineId)
    .getByTestId("button-success")
    .click();

  const tableStagedSellOrderLines = page.getByTestId("table-staged-sell-order-lines");
  await expect(tableStagedSellOrderLines).toBeVisible();
  const stagedSellOrderLinesRows = getTableRows(tableStagedSellOrderLines);
  expect(await stagedSellOrderLinesRows.count()).toBe(1);
  const stagedSellOrderLineRow = stagedSellOrderLinesRows.first();
  expect(await getTestId(stagedSellOrderLineRow)).toBe(sellOrderLineId);
  return stagedSellOrderLineRow;
}

// Leaves the Línea ready to be submitted, so the test decides how it is sent
export async function workflowFillCustomDeliveryNoteLine(
  page: Page,
  line: { description: string; quantity: number; unitPrice?: string },
) {
  const dialogCreateDeliveryNoteLine = await workflowOpenCreateDeliveryNoteLine(page);

  const checkboxCustomLine = dialogCreateDeliveryNoteLine.getByTestId("checkbox-custom-line");
  await checkboxCustomLine.click();
  await expect(checkboxCustomLine).toBeChecked();
  await getFormInputByLabel(dialogCreateDeliveryNoteLine, DESCRIPTION_LABEL).fill(line.description);
  await getFormInputByLabel(dialogCreateDeliveryNoteLine, QUANTITY_LABEL, InputElementType.Number).pressSequentially(
    String(line.quantity),
  );
  if (line.unitPrice !== undefined) {
    await getFormInputByLabel(dialogCreateDeliveryNoteLine, PRICE_LABEL, InputElementType.Number).pressSequentially(
      line.unitPrice,
    );
  }
  return dialogCreateDeliveryNoteLine.getByTestId("button-submit");
}

// The Líneas de pedido de venta have to be staged already
export async function workflowAppendStagedLinesToDeliveryNote(
  page: Page,
  deliveryNoteId: number,
  expectedErrorMessage?: string,
) {
  const dialog = page.getByTestId("dialog-add-lines-to-existing-delivery-note-content");
  const comboboxDeliveryNote = dialog.getByTestId("combobox-delivery-note");
  await page.getByTestId("button-add-lines-to-existing-delivery-note").click();
  await expect(dialog).toBeVisible();
  await openCombobox(comboboxDeliveryNote);
  await clickInComboboxOption(page, `Albarán ${deliveryNoteId} `);
  await assertComboboxValue(comboboxDeliveryNote, String(deliveryNoteId));
  await dialog.getByTestId("button-submit-add-lines-to-existing-delivery-note").click();
  await expectSingleToast(page, expectedErrorMessage);
}
