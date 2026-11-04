import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

export async function openCombobox(combobox: Locator) {
  await combobox.getByTestId("button-trigger").click();
}

export async function fillComboboxFilter(page: Page, value: string) {
  await page.getByTestId("combobox-input-filter").fill(value);
}

export async function assertComboboxOptionsCount(page: Page, expectedCount: number) {
  await expect(page.getByTestId("combobox-list").locator("[role='option']")).toHaveCount(expectedCount);
}

export async function clickInComboboxOption(page: Page, optionText: string) {
  await page.getByTestId("combobox-list").locator("[role='option']", { hasText: optionText }).click();
}

export function getClearComboboxButton(combobox: Locator): Locator {
  return combobox.getByTestId("button-clear");
}

export async function assertComboboxValue(combobox: Locator, expectedValue: string | null) {
  await expect(combobox).not.toHaveAttribute("data-loading");
  if (expectedValue === null) {
    await expect(combobox).not.toHaveAttribute("data-value");
    return;
  }
  await expect(combobox).toHaveAttribute("data-value", expectedValue);
}

export async function selectComboboxOption(page: Page, combobox: Locator, optionText: string, expectedValue?: string) {
  await openCombobox(combobox);
  await fillComboboxFilter(page, optionText);
  await assertComboboxOptionsCount(page, 1);
  await clickInComboboxOption(page, optionText);
  if (expectedValue !== undefined) {
    await assertComboboxValue(combobox, expectedValue);
  }
}
