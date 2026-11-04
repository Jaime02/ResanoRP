import { expect } from "@playwright/test";
import type { Locator } from "@playwright/test";

type TTablePagerButtonName = "Primera página" | "Página anterior" | "Página siguiente" | "Última página";

export function getTablePagerButton(table: Locator, name: TTablePagerButtonName): Locator {
  return table.locator("xpath=preceding-sibling::div[1]").getByRole("button", { exact: true, name });
}

// hasText matches substrings, so looking up "Cromado" would also find the row of "CROMADOS"
export function filterByExactText(elements: Locator, text: string): Locator {
  return elements.filter({ has: elements.page().getByText(text, { exact: true }) });
}

// Real data spreads the rows over pages of 10, so the row is looked for from the current page onwards
export async function findTableRow(table: Locator, row: Locator): Promise<Locator> {
  const buttonNextPage = getTablePagerButton(table, "Página siguiente");
  const pageLabel = table.locator("xpath=preceding-sibling::div[1]").getByText(/^Página \d+ de \d+$/);
  await expect(getTableRows(table).or(getTableNoDataRow(table)).first()).toBeVisible();
  while (!(await row.isVisible()) && (await buttonNextPage.isVisible()) && (await buttonNextPage.isEnabled())) {
    const currentPageLabel = await pageLabel.innerText();
    await buttonNextPage.click();
    await expect(pageLabel).not.toHaveText(currentPageLabel);
    await expect(getTableSkeletonRows(table)).toHaveCount(0);
  }
  await expect(row).toBeVisible();
  return row;
}

export async function findTableRowByText(table: Locator, text: string): Promise<Locator> {
  return findTableRow(table, filterByExactText(getTableRows(table), text));
}

export function getTableRows(table: Locator): Locator {
  return table.locator(
    ":scope > table > tbody > tr[data-row-type='row']:not([data-testid='tr-no-data'], [data-testid='tr-skeleton'])",
  );
}

export function getTableRowByTestId(table: Locator, id: number): Locator {
  return table.locator(`:scope > table > tbody > tr[data-testid='${id}'][data-row-type='row']`);
}

export function getTableSubrowById(table: Locator, id: number): Locator {
  return table.locator(`:scope > table > tbody > tr[data-testid='${id}'][data-row-type='subrow']`);
}

export function getTableSkeletonRows(table: Locator): Locator {
  return table.locator(":scope > table > tbody > tr[data-testid='tr-skeleton']");
}

export function getTableNoDataRow(table: Locator): Locator {
  return table.locator(":scope > table > tbody > tr[data-testid='tr-no-data']");
}

export function getEditableCellById(row: Locator, testId: string): Locator {
  return row.getByTestId(testId).getByTestId("editable-cell-input");
}

export function getDivDisabledMessage(table: Locator): Locator {
  return table.locator(":scope > div[data-testid='div-disabled-message']");
}

export function getTableRowByPosition(table: Locator, position: number): Locator {
  return getTableRows(table).nth(position);
}

// Counts every row of the table, not only the ones of the current page
export async function assertTableRowCount(table: Locator, count: number, options?: { timeout?: number }) {
  await expect(table.locator(":scope > table")).toHaveAttribute("data-row-count", String(count), options);
  if (count === 0) await expect(getTableNoDataRow(table)).toBeVisible();
}
