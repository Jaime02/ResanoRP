import fs from "node:fs";

import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { expectSingleToast } from "@/tests/utils/components/toast";

// Only the existence of the generated PDF is asserted, not its content
export function assertTagFileGenerated(tagFilePath: string) {
  expect(fs.existsSync(tagFilePath)).toBe(true);
  expect(fs.statSync(tagFilePath).size).toBeGreaterThan(0);
}

// The dialog fills in by default a single group of one tag holding the whole quantity of the row
export async function workflowPrintTag(page: Page, row: Locator, tagFilePath: string) {
  await row.getByTestId("button-print-tag").click();

  const dialogPrintTag = page.getByTestId("dialog-tag-print-content");
  await expect(dialogPrintTag).toBeVisible();
  await dialogPrintTag.getByTestId("button-submit").click();

  await expectSingleToast(page);

  await expect(dialogPrintTag).not.toBeVisible();
  assertTagFileGenerated(tagFilePath);
}
