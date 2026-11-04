import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

export async function openAndConfirmAlertDialog(page: Page, trigger: Locator, dialogContentId: string) {
  await expect(trigger).toBeVisible();
  await expect(trigger).toBeEnabled();
  await trigger.click();

  const dialog = page.getByTestId(dialogContentId);
  await expect(dialog).toBeVisible();

  const buttonAction = dialog.getByTestId("button-action");
  await expect(buttonAction).toBeVisible();
  await buttonAction.click();

  await expect(dialog).not.toBeVisible();
}
