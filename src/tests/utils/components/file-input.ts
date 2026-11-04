import type { Locator, Page } from "@playwright/test";

export async function setInputFiles(page: Page, input: Locator, filePath: string | Array<string>) {
  const fileChooserPromise = page.waitForEvent("filechooser");
  await input.click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(filePath);
}
