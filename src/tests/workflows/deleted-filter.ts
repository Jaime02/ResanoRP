import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { openAndConfirmAlertDialog } from "@/tests/utils/components/alert-dialog";
import { getPopoverContent } from "@/tests/utils/components/popover";
import { assertTableRowCount, getTableRowByTestId } from "@/tests/utils/components/table";
import { expectSingleToast } from "@/tests/utils/components/toast";
import { ToastType } from "@/types";

export enum EditButtonVisibility {
  Always = "always",
  OnlyActive = "onlyActive",
  Never = "never",
}

interface DeletedFilterTableParams {
  page: Page;
  url: string;
  tableTestId: string;
  filterLabel: string;
  getDeletedAt: (id: number) => Promise<Date | null | undefined>;
}

interface WorkflowDeletedFilterAndRestoreParams extends DeletedFilterTableParams {
  ids: Array<number>;
  editButton: EditButtonVisibility;
  restoredToastTitle: string;
  assertRow?: (row: Locator, isDeleted: boolean) => Promise<void>;
}

interface WorkflowRestoreTakenParams extends DeletedFilterTableParams {
  id: number;
  insertDuplicate: () => Promise<unknown>;
  errorMessage: string;
}

async function openDeletedFilter(page: Page, table: Locator, filterLabel: string, isChecked: boolean) {
  await table.getByTestId("popover-deleted-filter").getByTestId("popover-trigger").click();
  const popoverContent = getPopoverContent(page);
  await expect(popoverContent).toContainText(filterLabel);
  const checkbox = popoverContent.getByTestId("checkbox-filter-deleted");
  await (isChecked ? expect(checkbox).toBeChecked() : expect(checkbox).not.toBeChecked());
  return checkbox;
}

async function closeDeletedFilter(page: Page) {
  await page.keyboard.press("Escape");
  await expect(getPopoverContent(page)).toBeHidden();
}

async function toggleDeletedFilter(page: Page, table: Locator, filterLabel: string, showDeleted: boolean) {
  const checkbox = await openDeletedFilter(page, table, filterLabel, !showDeleted);
  await checkbox.click();
  await (showDeleted ? expect(checkbox).toBeChecked() : expect(checkbox).not.toBeChecked());
  // Changing the filter does not close the popover
  await expect(getPopoverContent(page)).toBeVisible();
  await closeDeletedFilter(page);
}

export async function workflowDeletedFilterAndRestore({
  page,
  url,
  tableTestId,
  filterLabel,
  getDeletedAt,
  ids,
  editButton,
  restoredToastTitle,
  assertRow,
}: WorkflowDeletedFilterAndRestoreParams) {
  expect(ids.length, "Wrong test set up: Some model should be active").toBeGreaterThan(0);
  const table = page.getByTestId(tableTestId);
  const deletedIds = new Set<number>();

  // Every row shows the actions of its state, and the deleted ones are only listed when asked for
  const assertRows = async (showDeleted: boolean) => {
    for (const id of ids) {
      const row = getTableRowByTestId(table, id);
      const isDeleted = deletedIds.has(id);
      if (isDeleted && !showDeleted) {
        await expect(row, `Row ${id}`).toHaveCount(0);
        continue;
      }
      await expect(row, `Row ${id}`).toBeVisible();
      await expect(row.getByTestId("button-delete"), `Row ${id}`).toHaveCount(isDeleted ? 0 : 1);
      await expect(row.getByTestId("button-restore"), `Row ${id}`).toHaveCount(isDeleted ? 1 : 0);
      const hasEditButton =
        editButton === EditButtonVisibility.Always || (editButton === EditButtonVisibility.OnlyActive && !isDeleted);
      await expect(row.getByTestId("button-edit"), `Row ${id}`).toHaveCount(hasEditButton ? 1 : 0);
      await assertRow?.(row, isDeleted);
    }
    await assertTableRowCount(table, ids.filter((id) => showDeleted || !deletedIds.has(id)).length);
  };

  for (const id of ids) {
    const row = getTableRowByTestId(table, id);
    await page.goto(url);
    await assertRows(false);

    await openAndConfirmAlertDialog(page, row.getByTestId("button-delete"), "dialog-delete-model-content");
    await expectSingleToast(page);
    deletedIds.add(id);
    await assertRows(false);
    expect(await getDeletedAt(id)).toBeInstanceOf(Date);

    await toggleDeletedFilter(page, table, filterLabel, true);
    await assertRows(true);

    // The filter is kept in the URL
    await page.reload();
    await openDeletedFilter(page, table, filterLabel, true);
    await closeDeletedFilter(page);
    await assertRows(true);

    // Cancelling the restore keeps it deleted
    await row.getByTestId("button-restore").click();
    const dialogRestore = page.getByTestId("dialog-restore-model-content");
    await expect(dialogRestore).toBeVisible();
    await dialogRestore.getByTestId("button-close").click();
    await expect(dialogRestore).not.toBeVisible();
    await assertRows(true);
    expect(await getDeletedAt(id)).toBeInstanceOf(Date);

    await openAndConfirmAlertDialog(page, row.getByTestId("button-restore"), "dialog-restore-model-content");
    await expectSingleToast(page, { message: restoredToastTitle, type: ToastType.Success });
    deletedIds.delete(id);
    await assertRows(true);
    expect(await getDeletedAt(id)).toBeNull();

    // Deleting it while the deleted ones are listed keeps its row, which can be restored again
    await openAndConfirmAlertDialog(page, row.getByTestId("button-delete"), "dialog-delete-model-content");
    await expectSingleToast(page);
    deletedIds.add(id);
    await assertRows(true);
    expect(await getDeletedAt(id)).toBeInstanceOf(Date);

    await toggleDeletedFilter(page, table, filterLabel, false);
    await assertRows(false);
  }
}

export async function workflowRestoreTaken({
  page,
  url,
  tableTestId,
  filterLabel,
  getDeletedAt,
  id,
  insertDuplicate,
  errorMessage,
}: WorkflowRestoreTakenParams) {
  const table = page.getByTestId(tableTestId);
  const row = getTableRowByTestId(table, id);

  await page.goto(url);
  await openAndConfirmAlertDialog(page, row.getByTestId("button-delete"), "dialog-delete-model-content");
  await expectSingleToast(page);
  await expect(row).toHaveCount(0);

  await insertDuplicate();
  await toggleDeletedFilter(page, table, filterLabel, true);

  await openAndConfirmAlertDialog(page, row.getByTestId("button-restore"), "dialog-restore-model-content");
  await expectSingleToast(page, errorMessage);

  await expect(row.getByTestId("button-restore")).toBeVisible();
  await expect(row.getByTestId("button-delete")).toHaveCount(0);
  expect(await getDeletedAt(id)).toBeInstanceOf(Date);
}
