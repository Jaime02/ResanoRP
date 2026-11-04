import fs from "node:fs";

import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { clearToasts, getToastType, getToasts } from "@/tests/utils/components/toast";
import { ToastType } from "@/types";

// Only the existence of the generated PDF is asserted, not its content
export function assertTagFileGenerated(tagFilePath: string) {
  expect(fs.existsSync(tagFilePath)).toBe(true);
  expect(fs.statSync(tagFilePath).size).toBeGreaterThan(0);
}

// The dialog fills in by default a single group of one tag holding the whole quantity of the row
export async function workflowPrintTag(page: Page, row: Locator, tagFilePath: string) {
  const toasts = getToasts(page);
  await row.getByTestId("button-print-tag").click();

  const dialogPrintTag = page.getByTestId("dialog-tag-print-content");
  await expect(dialogPrintTag).toBeVisible();
  await dialogPrintTag.getByTestId("button-submit").click();

  await expect(toasts).toHaveCount(1);
  expect(await getToastType(toasts.first())).toBe(ToastType.Success);
  await clearToasts(page);

  await expect(dialogPrintTag).not.toBeVisible();
  assertTagFileGenerated(tagFilePath);
}
