import fs from "node:fs/promises";

import { expect } from "@playwright/test";
import type { Download, Locator, Page } from "@playwright/test";

import { getDeliveryNote, getDeliveryNotes, getDeliveryNoteWithLinesForDocument } from "@/db/functions/delivery-note";
import { getInvoiceById, getInvoices } from "@/db/functions/invoice";
import { startOfAppDay } from "@/lib/dates";
import { formatCents, getDeliveryNoteLineUnitPrice, getLinesTotalInCents, getTotalWithVatInCents } from "@/lib/prices";
import { CLIENT_LABEL, FROM_LABEL, TO_LABEL } from "@/messages/common";
import { INVOICE_CREATE_TITLE } from "@/messages/invoice";
import { openAndConfirmAlertDialog } from "@/tests/utils/components/alert-dialog";
import { selectComboboxOption } from "@/tests/utils/components/combobox";
import { selectDateInputDate } from "@/tests/utils/components/date-input";
import { InputElementType, getFormInputByLabel } from "@/tests/utils/components/form";
import { assertTableRowCount, getTableRowByTestId } from "@/tests/utils/components/table";
import { expectSingleToast } from "@/tests/utils/components/toast";
import type { BaseClient } from "@/types/client";
import type { BaseDeliveryNote } from "@/types/delivery-note";

export function getDeliveryDatesRange(deliveryNotes: Array<BaseDeliveryNote>) {
  const deliveryTimes = deliveryNotes.map((deliveryNote) => deliveryNote.deliveryDate!.getTime());
  return { endDate: new Date(Math.max(...deliveryTimes)), startDate: new Date(Math.min(...deliveryTimes)) };
}

async function assertTableDeliveryNotes(table: Locator, deliveryNotes: Array<BaseDeliveryNote>) {
  await assertTableRowCount(table, deliveryNotes.length);
  for (const deliveryNote of deliveryNotes) {
    await expect(getTableRowByTestId(table, deliveryNote.id)).toBeVisible();
  }
}

// The range is filled in from the pending Albaranes displayed, so it is only settled once it spans all of them
export async function assertDateRangeOfDeliveryNotes(dialog: Locator, deliveryNotes: Array<BaseDeliveryNote>) {
  const inputStartDate = getFormInputByLabel(dialog, FROM_LABEL, InputElementType.Date);
  const inputEndDate = getFormInputByLabel(dialog, TO_LABEL, InputElementType.Date);
  if (deliveryNotes.length === 0) {
    await expect(inputStartDate).not.toHaveAttribute("data-value");
    await expect(inputEndDate).not.toHaveAttribute("data-value");
    return;
  }
  const { startDate, endDate } = getDeliveryDatesRange(deliveryNotes);
  await expect(inputStartDate).toHaveAttribute("data-value", startOfAppDay(startDate).toISOString());
  await expect(inputEndDate).toHaveAttribute("data-value", startOfAppDay(endDate).toISOString());
}

async function getPendingDeliveryNotes(clientId?: number) {
  return (await getDeliveryNotes()).filter(
    (deliveryNote) => deliveryNote.invoiceId === null && (clientId === undefined || deliveryNote.clientId === clientId),
  );
}

export async function getDeliveryNoteTotalInCents(deliveryNoteId: number) {
  const deliveryNote = await getDeliveryNoteWithLinesForDocument(deliveryNoteId);
  expect(deliveryNote).toBeDefined();
  return getLinesTotalInCents(
    deliveryNote!.deliveryNoteLines.map((deliveryNoteLine) => ({
      quantity: deliveryNoteLine.quantity,
      unitPrice: getDeliveryNoteLineUnitPrice(deliveryNoteLine),
    })),
  );
}

export async function assertTableInvoiceTotals(table: Locator, invoiceId: number) {
  const invoice = await getInvoiceById(invoiceId);
  expect(invoice).toBeDefined();

  const lines = [];
  for (const { id } of invoice!.deliveryNotes) {
    const deliveryNote = await getDeliveryNoteWithLinesForDocument(id);
    expect(deliveryNote).toBeDefined();
    lines.push(
      ...deliveryNote!.deliveryNoteLines.map((deliveryNoteLine) => ({
        quantity: deliveryNoteLine.quantity,
        unitPrice: getDeliveryNoteLineUnitPrice(deliveryNoteLine),
        vatPercentage: deliveryNoteLine.vatPercentage,
      })),
    );
  }

  const rowInvoice = getTableRowByTestId(table, invoiceId);
  await expect(rowInvoice.getByTestId("taxableBase")).toHaveText(formatCents(getLinesTotalInCents(lines)));
  await expect(rowInvoice.getByTestId("total")).toHaveText(formatCents(getTotalWithVatInCents(lines)));
}

export async function assertTablePendingDeliveryNotes(dialog: Locator, deliveryNotes: Array<BaseDeliveryNote>) {
  const tablePendingDeliveryNotes = dialog.getByTestId("table-pending-delivery-note");
  await assertTableDeliveryNotes(tablePendingDeliveryNotes, deliveryNotes);

  let totalInCents = 0;
  for (const deliveryNote of deliveryNotes) {
    const deliveryNoteTotalInCents = await getDeliveryNoteTotalInCents(deliveryNote.id);
    totalInCents += deliveryNoteTotalInCents;
    await expect(getTableRowByTestId(tablePendingDeliveryNotes, deliveryNote.id).getByTestId("total")).toHaveText(
      formatCents(deliveryNoteTotalInCents),
    );
  }
  await expect(dialog.getByTestId("span-pending-delivery-notes-total")).toHaveText(
    `Total sin IVA: ${formatCents(totalInCents)}`,
  );
}

export async function selectInvoiceClient(page: Page, dialog: Locator, client: BaseClient) {
  await selectComboboxOption(
    page,
    getFormInputByLabel(dialog, CLIENT_LABEL, InputElementType.Combobox),
    client.name,
    String(client.id),
  );
}

export async function workflowPickInvoiceClient(page: Page, dialog: Locator, client: BaseClient) {
  await selectInvoiceClient(page, dialog, client);

  const clientPendingDeliveryNotes = await getPendingDeliveryNotes(client.id);
  await assertTablePendingDeliveryNotes(dialog, clientPendingDeliveryNotes);
  await assertDateRangeOfDeliveryNotes(dialog, clientPendingDeliveryNotes);
}

export async function workflowCreateInvoice(
  page: Page,
  { client, startDate, endDate }: { client: BaseClient; startDate?: Date; endDate?: Date },
) {
  const previousInvoiceIds = (await getInvoices()).map((invoice) => invoice.id);

  await page.goto("/invoicing");
  const tableInvoices = page.getByTestId("table-invoice");
  await expect(tableInvoices).toBeVisible();

  await page.getByRole("button", { name: INVOICE_CREATE_TITLE }).click();
  const dialogCreateInvoice = page.getByTestId("dialog-create-invoice");
  await expect(dialogCreateInvoice).toBeVisible();

  await workflowPickInvoiceClient(page, dialogCreateInvoice, client);
  if (startDate !== undefined) {
    await selectDateInputDate(
      page,
      getFormInputByLabel(dialogCreateInvoice, FROM_LABEL, InputElementType.Date),
      startDate,
    );
  }
  if (endDate !== undefined) {
    await selectDateInputDate(page, getFormInputByLabel(dialogCreateInvoice, TO_LABEL, InputElementType.Date), endDate);
  }
  await dialogCreateInvoice.getByTestId("button-submit").click();

  await expect(dialogCreateInvoice).not.toBeVisible();
  await expectSingleToast(page);

  // A single Factura is created, holding only the Albaranes of the picked Cliente
  const newInvoices = (await getInvoices()).filter((invoice) => !previousInvoiceIds.includes(invoice.id));
  expect(newInvoices.length).toBe(1);
  const [newInvoice] = newInvoices;
  expect(newInvoice.clientId).toBe(client.id);
  await expect(getTableRowByTestId(tableInvoices, newInvoice.id)).toBeVisible();
  await assertTableInvoiceTotals(tableInvoices, newInvoice.id);

  return newInvoice;
}

export async function workflowDeleteInvoice(page: Page, invoiceId: number) {
  const invoice = await getInvoiceById(invoiceId);
  expect(invoice).toBeDefined();

  await page.goto("/invoicing");
  const rowInvoice = getTableRowByTestId(page.getByTestId("table-invoice"), invoiceId);
  await expect(rowInvoice).toBeVisible();

  await openAndConfirmAlertDialog(page, rowInvoice.getByTestId("button-delete"), "dialog-delete-model-content");

  await expect(rowInvoice).not.toBeVisible();
  await expectSingleToast(page);

  expect(await getInvoiceById(invoiceId)).toBeUndefined();

  // The Albaranes of a deleted Factura are not deleted, they become pending to be invoiced again
  for (const deliveryNote of invoice!.deliveryNotes) {
    const dbDeliveryNote = await getDeliveryNote({ id: deliveryNote.id });
    expect(dbDeliveryNote).toBeDefined();
    expect(dbDeliveryNote!.invoiceId).toBeNull();
  }
}

// The table has to be opened already
export async function workflowUnaccountInvoice(page: Page, invoiceId: number, expectedErrorMessage?: string) {
  await openAndConfirmAlertDialog(
    page,
    getTableRowByTestId(page.getByTestId("table-invoice"), invoiceId).getByTestId("button-unaccount-invoice"),
    "dialog-unaccount-invoice-content",
  );
  await expectSingleToast(page, expectedErrorMessage);
}

export async function confirmAccountInvoices(page: Page) {
  await page.getByTestId("button-account-invoices").click();
  const dialog = page.getByTestId("dialog-account-invoices-content");
  await expect(dialog).toBeVisible();
  await dialog.getByTestId("button-action").click();
  await expect(dialog).not.toBeVisible();
}

export async function workflowAccountInvoices(page: Page) {
  const downloadPromise = page.waitForEvent("download");
  await confirmAccountInvoices(page);
  const download: Download = await downloadPromise;
  await expectSingleToast(page);
  const content = await fs.readFile(await download.path());
  return { content, fileName: download.suggestedFilename() };
}
