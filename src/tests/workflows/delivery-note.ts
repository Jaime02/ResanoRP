import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

import { getDeliveryNote, getSellOrderLinesByDeliveryNoteId } from "@/db/functions/delivery-note";
import {
  getDeliveryNoteLinesByDeliveryNoteId,
  getSellOrderLineDeliveredQuantity,
} from "@/db/functions/delivery-note-line";
import { getSellOrderLineById } from "@/db/functions/sell-order-line";
import { clampPendingQuantity } from "@/lib/sell-order-line";
import { ADD_PART_LABEL, DESCRIPTION_LABEL, PRICE_LABEL, QUANTITY_LABEL } from "@/messages/common";
import {
  DELIVERY_NOTE_DELETED_DESCRIPTION,
  DELIVERY_NOTE_DELETED_MESSAGE,
  LINES_ADDED_TO_DELIVERY_NOTE_MESSAGE,
} from "@/messages/delivery-note";
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
import { expectSingleSuccessOrErrorToast, expectSingleSuccessToast } from "@/tests/utils/components/toast";
import type { BaseClient } from "@/types/client";

export async function workflowDeleteDeliveryNote(page: Page, deliveryNoteId: number) {
  await page.goto("/delivery-note");
  const rowDeliveryNote = getTableRowByTestId(page.getByTestId("table-delivery-note"), deliveryNoteId);
  await expect(rowDeliveryNote).toBeVisible();

  const affectedSellOrderLines = await getSellOrderLinesByDeliveryNoteId(deliveryNoteId);
  const deliveryNoteLines = await getDeliveryNoteLinesByDeliveryNoteId(deliveryNoteId);

  await openAndConfirmAlertDialog(page, rowDeliveryNote.getByTestId("button-delete"), "dialog-delete-model-content");

  await expect(rowDeliveryNote).not.toBeVisible();
  await expectSingleSuccessToast(
    page,
    DELIVERY_NOTE_DELETED_MESSAGE,
    DELIVERY_NOTE_DELETED_DESCRIPTION(deliveryNoteId),
  );
  const dbDeletedDeliveryNote = await getDeliveryNote({ id: deliveryNoteId });
  expect(dbDeletedDeliveryNote).toBeUndefined();

  expect((await getDeliveryNoteLinesByDeliveryNoteId(deliveryNoteId)).length).toBe(0);

  // The sell order lines get back what every line of the delivery note delivered of them, within what is still not
  // delivered by the other delivery notes
  for (const sellOrderLine of affectedSellOrderLines) {
    const deliveredQuantity = deliveryNoteLines
      .filter((deliveryNoteLine) => deliveryNoteLine.sellOrderLineId === sellOrderLine.id)
      .reduce((total, deliveryNoteLine) => total + deliveryNoteLine.quantity, 0);
    const dbSellOrderLine = await getSellOrderLineById(sellOrderLine.id);
    expect(dbSellOrderLine?.pendingQuantity).toBe(
      clampPendingQuantity(
        sellOrderLine.pendingQuantity + deliveredQuantity,
        sellOrderLine.quantity,
        await getSellOrderLineDeliveredQuantity(sellOrderLine.id),
      ),
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
  await selectComboboxOption(page, page.getByTestId("combobox-client"), client.name, String(client.id));
  await expect(page.getByTestId("table-pending-sell-orders")).toBeVisible();
}

export function getButtonSubmitFormDeliveryNote(page: Page) {
  return page.getByTestId("button-submit-form-delivery-note");
}

export async function workflowStageSingleSellOrderLine(page: Page, sellOrderLineId: number) {
  await getTableRowByTestId(page.getByTestId("table-pending-sell-orders"), sellOrderLineId)
    .getByTestId("button-success")
    .click();

  const tableStagedSellOrderLines = page.getByTestId("table-staged-sell-order-lines");
  await expect(tableStagedSellOrderLines).toBeVisible();
  const stagedSellOrderLinesRows = getTableRows(tableStagedSellOrderLines);
  await expect(stagedSellOrderLinesRows).toHaveCount(1);
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
// Leaves the dialog ready to be submitted, so the test decides when it is sent
export async function workflowPrepareAppendStagedLinesToDeliveryNote(page: Page, deliveryNoteId: number) {
  const dialog = page.getByTestId("dialog-add-lines-to-existing-delivery-note-content");
  const comboboxDeliveryNote = dialog.getByTestId("combobox-delivery-note");
  await page.getByTestId("button-add-lines-to-existing-delivery-note").click();
  await expect(dialog).toBeVisible();
  await openCombobox(comboboxDeliveryNote);
  await clickInComboboxOption(page, `Albarán ${deliveryNoteId} `);
  await assertComboboxValue(comboboxDeliveryNote, String(deliveryNoteId));
  return dialog.getByTestId("button-submit-add-lines-to-existing-delivery-note");
}

export async function workflowAppendStagedLinesToDeliveryNote(
  page: Page,
  deliveryNoteId: number,
  expectedErrorMessage?: string,
) {
  await (await workflowPrepareAppendStagedLinesToDeliveryNote(page, deliveryNoteId)).click();
  await expectSingleSuccessOrErrorToast(page, LINES_ADDED_TO_DELIVERY_NOTE_MESSAGE, expectedErrorMessage);
}
