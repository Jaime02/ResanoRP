import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

export function getPopoverContent(page: Page): Locator {
  return page.getByTestId("popover-content");
}

// The trigger says whether its popover is open, which does not wait for the animation like the content does
export async function openPopover(trigger: Locator) {
  if ((await trigger.getAttribute("aria-expanded")) !== "true") {
    await trigger.click();
  }
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
}

export async function closePopover(page: Page, trigger: Locator) {
  if ((await trigger.getAttribute("aria-expanded")) === "true") {
    await page.keyboard.press("Escape");
  }
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
}
