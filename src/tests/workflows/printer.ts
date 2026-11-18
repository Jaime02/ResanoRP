import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { formatPrinterAddress } from "@/lib/formatters";
import { NAME_LABEL } from "@/messages/common";
import {
  PRINTER_ADDRESS_LABEL,
  PRINTER_CREATED_MESSAGE,
  PRINTER_CREATE_TITLE,
  PRINTER_DELETED_MESSAGE,
  PRINTER_EDITED_MESSAGE,
  PRINTER_KIND_LABEL,
  PRINTER_KIND_LABELS,
  PRINTER_LABEL_LENGTH_LABEL,
  PRINTER_LABEL_WIDTH_LABEL,
  PRINTER_PASSWORD_LABEL,
  PRINTER_SHARE_NAME_LABEL,
  PRINTER_USERNAME_LABEL,
} from "@/messages/printer";
import { openAndConfirmAlertDialog } from "@/tests/utils/components/alert-dialog";
import { clickInComboboxOption, openCombobox, selectComboboxOption } from "@/tests/utils/components/combobox";
import { assertFormLoaded, getFormInputByLabel, InputElementType } from "@/tests/utils/components/form";
import { findTableRowByText } from "@/tests/utils/components/table";
import { expectSingleSuccessToast, getToasts } from "@/tests/utils/components/toast";
import { readPrintJobs } from "@/tests/utils/mock-printer";
import { PrinterKind } from "@/types/printer";

export const MAINTENANCE_PRINTER_URL = "/maintenance?tab=printer";

export interface TPrinterFields {
  name: string;
  address: string;
  // Left as the form has it when not given, a printer on the network for its address in the table
  kind?: PrinterKind;
  shareName?: string;
  username?: string;
  password?: string;
  labelWidthMm?: number;
  labelLengthMm?: number;
  forTags?: boolean;
}

const getPrinterAddress = (printer: TPrinterFields) =>
  formatPrinterAddress({
    address: printer.address.trim(),
    kind: printer.kind ?? PrinterKind.Ipp,
    shareName: printer.shareName?.trim() ?? null,
  });

export function getTablePrinter(page: Page) {
  return page.getByTestId("table-printer");
}

export function getDialogCreateEditPrinter(page: Page) {
  return page.getByTestId("dialog-create-edit-printer");
}

export async function findPrinterRow(page: Page, name: string) {
  return findTableRowByText(getTablePrinter(page), name);
}

export async function workflowFillPrinter(page: Page, printer: TPrinterFields) {
  const dialog = getDialogCreateEditPrinter(page);
  await getFormInputByLabel(dialog, NAME_LABEL).fill(printer.name);
  if (printer.kind !== undefined) {
    await selectComboboxOption(
      page,
      getFormInputByLabel(dialog, PRINTER_KIND_LABEL, InputElementType.Combobox),
      PRINTER_KIND_LABELS[printer.kind],
    );
  }
  await getFormInputByLabel(dialog, PRINTER_ADDRESS_LABEL).fill(printer.address);
  const optionalFields = [
    [PRINTER_SHARE_NAME_LABEL, printer.shareName],
    [PRINTER_USERNAME_LABEL, printer.username],
    [PRINTER_PASSWORD_LABEL, printer.password],
    [PRINTER_LABEL_WIDTH_LABEL, printer.labelWidthMm],
    [PRINTER_LABEL_LENGTH_LABEL, printer.labelLengthMm],
  ] as const;
  for (const [label, value] of optionalFields) {
    if (value !== undefined) {
      await getFormInputByLabel(dialog, label).fill(String(value));
    }
  }
  if (printer.forTags !== undefined) {
    await dialog.getByTestId("dialog-create-edit-printer-for-tags").setChecked(printer.forTags);
  }
  await dialog.getByTestId("button-submit").click();
}

export async function workflowOpenCreatePrinter(page: Page) {
  await page.getByRole("button", { name: PRINTER_CREATE_TITLE }).click();
  await expect(getDialogCreateEditPrinter(page)).toBeVisible();
}

// Expects the maintenance page of the Impresoras to be open
export async function workflowCreatePrinter(page: Page, printer: TPrinterFields) {
  await workflowOpenCreatePrinter(page);
  await workflowFillPrinter(page, printer);
  await expect(getDialogCreateEditPrinter(page)).not.toBeVisible();
  await expectSingleSuccessToast(page, PRINTER_CREATED_MESSAGE);
  await expect(await findPrinterRow(page, printer.name)).toContainText(getPrinterAddress(printer));
}

export async function workflowEditPrinter(page: Page, currentName: string, printer: TPrinterFields) {
  await (await findPrinterRow(page, currentName)).getByTestId("button-edit").click();
  await assertFormLoaded(getDialogCreateEditPrinter(page));
  await workflowFillPrinter(page, printer);
  await expect(getDialogCreateEditPrinter(page)).not.toBeVisible();
  await expectSingleSuccessToast(page, PRINTER_EDITED_MESSAGE);
  await expect(await findPrinterRow(page, printer.name)).toContainText(getPrinterAddress(printer));
}

export async function workflowDeletePrinter(page: Page, name: string) {
  await openAndConfirmAlertDialog(
    page,
    (await findPrinterRow(page, name)).getByTestId("button-delete"),
    "dialog-delete-model-content",
  );
  await expectSingleSuccessToast(page, PRINTER_DELETED_MESSAGE);
}

export async function workflowPingPrinter(page: Page, name: string) {
  const buttonPing = (await findPrinterRow(page, name)).getByTestId("button-ping-printer");
  await buttonPing.click();
  await expect(buttonPing).toBeEnabled();
}

export function getComboboxPrinter(dialog: Locator) {
  return dialog.getByTestId("combobox-printer");
}

export async function assertSelectedPrinter(dialog: Locator, name: string) {
  const comboboxPrinter = getComboboxPrinter(dialog);
  await expect(comboboxPrinter).not.toHaveAttribute("data-loading");
  await expect(comboboxPrinter.getByTestId("button-trigger")).toHaveText(name);
}

// Printing on a server Impresora shows a toast, so the browser printed it if none shows up and no job arrives
export async function expectPrintedByBrowser(page: Page, buttonPrint: Locator) {
  const previousJobsCount = readPrintJobs().length;
  const frameAttached = page.waitForEvent("frameattached");
  await buttonPrint.click();
  await frameAttached;
  await expect(getToasts(page)).toHaveCount(0);
  expect(readPrintJobs()).toHaveLength(previousJobsCount);
}

export async function workflowSelectPrinter(page: Page, dialog: Locator, name: string) {
  await openCombobox(getComboboxPrinter(dialog));
  await clickInComboboxOption(page, name);
  await assertSelectedPrinter(dialog, name);
}
