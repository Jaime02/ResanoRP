import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { formatAppDate, startOfAppDay } from "@/lib/dates";
import { getPopoverContent } from "@/tests/utils/components/popover";

export async function getDateInputValue(dateInput: Locator): Promise<Date | null> {
  const value = await dateInput.getAttribute("data-value");
  return value !== null ? new Date(value) : null;
}

function getCalendarDay(date: Date): string {
  return formatAppDate(date, "yyyy-MM-dd");
}

export async function selectDateInputDate(page: Page, dateInput: Locator, date: Date) {
  await dateInput.getByTestId("popover-trigger").click();
  const popoverContent = getPopoverContent(page);
  await expect(popoverContent).toBeVisible();

  // The calendar opens on the current month, so it has to be paged until the month of the date is displayed
  const displayedCalendarDay = await popoverContent
    .locator("td[role='gridcell']:not([data-outside])")
    .first()
    .getAttribute("data-day");
  expect(displayedCalendarDay).not.toBeNull();
  const [displayedYear, displayedMonth] = displayedCalendarDay!.split("-").map(Number);
  const [year, month] = getCalendarDay(date).split("-").map(Number);
  const monthsToDate = (year - displayedYear) * 12 + (month - displayedMonth);
  const buttonChangeMonth = popoverContent.getByRole("button", {
    name: monthsToDate < 0 ? "Ir al mes anterior" : "Ir al mes siguiente",
  });
  for (let i = 0; i < Math.abs(monthsToDate); i++) {
    await buttonChangeMonth.click();
  }

  await popoverContent
    .locator(`td[role='gridcell'][data-day='${getCalendarDay(date)}']:not([data-outside])`)
    .getByRole("button")
    .click();
  await expect(popoverContent).not.toBeVisible();

  await expect(dateInput).toHaveAttribute("data-value", startOfAppDay(date).toISOString());
}
