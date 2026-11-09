import type { FileChooser, Locator, Page } from "@playwright/test";

export async function setInputFiles(page: Page, input: Locator, filePath: Parameters<FileChooser["setFiles"]>[0]) {
  const fileChooserPromise = page.waitForEvent("filechooser");
  await input.click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(filePath);
}
