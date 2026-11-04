import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { assertTableRowCount, getTableRowByTestId, getTableSkeletonRows } from "@/tests/utils/components/table";
import { getMockClientParts, getMockPartReferences } from "@/tests/utils/mock-data-utils";

export async function getPickerValue(picker: Locator): Promise<string | null> {
  return picker.getAttribute("data-value");
}

export async function getPickerText(picker: Locator): Promise<string | null> {
  return picker.getByTestId("button-trigger").textContent();
}

export async function openPicker(picker: Locator): Promise<void> {
  return picker.getByTestId("button-trigger").click();
}

export function getPickerDialogContent(page: Page, testId: string): Locator {
  return page.getByTestId(`${testId}-content`);
}

export async function clearPicker(picker: Locator): Promise<void> {
  return picker.getByTestId("button-clear").click();
}

export async function openPartPicker(page: Page, pickerPart: Locator) {
  await openPicker(pickerPart);
  const dialogPickerPartContent = getPickerDialogContent(page, (await pickerPart.getAttribute("data-testid"))!);
  await expect(dialogPickerPartContent).toBeVisible();
  const tablePickerPart = dialogPickerPartContent.getByTestId("table-picker-part");
  await expect(tablePickerPart).toBeVisible();
  await expect(getTableSkeletonRows(tablePickerPart)).toHaveCount(0);
  return { dialogPickerPartContent, tablePickerPart };
}

// Filtering replaces the picker state, so the default includePartReferenceNullClientId filter must survive it
export async function assertPickerPartKeepsNullClientParts(tablePickerPart: Locator, clientId: number) {
  const clientParts = getMockClientParts({ clientId, includePartReferenceNullClientId: true });
  const clientOnlyPartIds = getMockClientParts({ clientId }).map((part) => part.id);
  const nullClientOnlyPart = clientParts.find((part) => !clientOnlyPartIds.includes(part.id));
  expect(nullClientOnlyPart, `Client ${clientId} needs a part only reachable by a null client reference`).toBeDefined();

  await assertTableRowCount(tablePickerPart, clientParts.length);
  await expect(getTableRowByTestId(tablePickerPart, nullClientOnlyPart!.id)).toBeVisible();

  const partsOnlyReachableByDeletedReferences = getMockPartReferences({
    includeDeleted: true,
    includeNullClientId: true,
  })
    .filter((partReference) => partReference.deletedAt !== null)
    .map((partReference) => partReference.partId)
    .filter((partId) => !clientParts.some((part) => part.id === partId));
  for (const partId of partsOnlyReachableByDeletedReferences) {
    await expect(getTableRowByTestId(tablePickerPart, partId)).toHaveCount(0);
  }

  const inputDescriptionFilter = tablePickerPart.getByTestId("input-filter-description");
  await inputDescriptionFilter.fill(nullClientOnlyPart!.description);
  await assertTableRowCount(tablePickerPart, 1);
  await expect(getTableRowByTestId(tablePickerPart, nullClientOnlyPart!.id)).toBeVisible();

  await inputDescriptionFilter.clear();
  await assertTableRowCount(tablePickerPart, clientParts.length);
  await expect(getTableRowByTestId(tablePickerPart, nullClientOnlyPart!.id)).toBeVisible();
}
