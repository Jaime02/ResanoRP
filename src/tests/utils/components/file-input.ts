import type { FileChooser, Locator, Page } from "@playwright/test";

import { recordPickedFiles } from "@/tests/utils/audit-log";

export type TPickedFiles = Parameters<FileChooser["setFiles"]>[0];

export async function setInputFiles(page: Page, input: Locator, filePath: TPickedFiles) {
  const fileChooserPromise = page.waitForEvent("filechooser");
  await input.click();
  const fileChooser = await fileChooserPromise;
  recordPickedFiles(filePath);
  await fileChooser.setFiles(filePath);
}
