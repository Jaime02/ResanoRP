import type { Locator, Page } from "@playwright/test";

export function getPopoverContent(page: Page): Locator {
  return page.getByTestId("popover-content");
}
