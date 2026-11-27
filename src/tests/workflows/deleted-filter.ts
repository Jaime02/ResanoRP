import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { openAndConfirmAlertDialog } from "@/tests/utils/components/alert-dialog";
import { getPopoverContent } from "@/tests/utils/components/popover";
import { assertTableRowCount, getTableRowByTestId, getTableRows } from "@/tests/utils/components/table";
import { expectSingleSuccessToast, expectSingleToast } from "@/tests/utils/components/toast";
import { expectUniqueViolationRejected, type TUniqueViolation } from "@/tests/utils/errors-log";

export enum EditButtonVisibility {
  Always = "always",
  OnlyActive = "onlyActive",
  Never = "never",
}

enum RowAction {
  Delete = "button-delete",
  Restore = "button-restore",
  Edit = "button-edit",
}

type TRowActions = Record<RowAction, number>;

// A single call reads the actions of every row, as one assertion per row and action made the loops of the tests slow
async function readRowActions(table: Locator): Promise<Record<string, TRowActions>> {
  return Object.fromEntries(
    await getTableRows(table).evaluateAll(
      (rows, actions) =>
        rows.map((row) => [
          row.dataset.testid,
          Object.fromEntries(
            actions.map((action) => [action, row.querySelectorAll(`[data-testid='${action}']`).length]),
          ),
        ]),
      Object.values(RowAction),
    ),
  );
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
  deletedToastTitle: string;
  restoredToastTitle: string;
  assertRow?: (row: Locator, isDeleted: boolean) => Promise<void>;
}

interface WorkflowRestoreTakenParams extends DeletedFilterTableParams {
  id: number;
  insertDuplicate: () => Promise<unknown>;
  uniqueViolation: TUniqueViolation;
  errorMessage: string;
  deletedToastTitle: string;
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
  deletedToastTitle,
  restoredToastTitle,
  assertRow,
}: WorkflowDeletedFilterAndRestoreParams) {
  expect(ids.length, "Wrong test set up: Some model should be active").toBeGreaterThan(0);
  const table = page.getByTestId(tableTestId);
  const deletedIds = new Set<number>();

  // Every row shows the actions of its state, and the deleted ones are only listed when asked for
  const assertRows = async (showDeleted: boolean) => {
    const shownIds = ids.filter((id) => showDeleted || !deletedIds.has(id));
    const expectedRowActions = Object.fromEntries(
      shownIds.map((id): [string, TRowActions] => {
        const isDeleted = deletedIds.has(id);
        const hasEditButton =
          editButton === EditButtonVisibility.Always || (editButton === EditButtonVisibility.OnlyActive && !isDeleted);
        return [
          String(id),
          {
            [RowAction.Delete]: isDeleted ? 0 : 1,
            [RowAction.Restore]: isDeleted ? 1 : 0,
            [RowAction.Edit]: hasEditButton ? 1 : 0,
          },
        ];
      }),
    );
    await expect
      .poll(async () => readRowActions(table), { message: "Every row should have the actions of its state" })
      .toEqual(expectedRowActions);
    for (const id of shownIds) {
      await assertRow?.(getTableRowByTestId(table, id), deletedIds.has(id));
    }
    await assertTableRowCount(table, shownIds.length);
  };

  for (const id of ids) {
    const row = getTableRowByTestId(table, id);
    await page.goto(url);
    await assertRows(false);

    await openAndConfirmAlertDialog(page, row.getByTestId(RowAction.Delete), "dialog-delete-model-content");
    await expectSingleSuccessToast(page, deletedToastTitle);
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
    await row.getByTestId(RowAction.Restore).click();
    const dialogRestore = page.getByTestId("dialog-restore-model-content");
    await expect(dialogRestore).toBeVisible();
    await dialogRestore.getByTestId("button-close").click();
    await expect(dialogRestore).not.toBeVisible();
    await assertRows(true);
    expect(await getDeletedAt(id)).toBeInstanceOf(Date);

    await openAndConfirmAlertDialog(page, row.getByTestId(RowAction.Restore), "dialog-restore-model-content");
    await expectSingleSuccessToast(page, restoredToastTitle);
    deletedIds.delete(id);
    await assertRows(true);
    expect(await getDeletedAt(id)).toBeNull();

    // Deleting it while the deleted ones are listed keeps its row, which can be restored again
    await openAndConfirmAlertDialog(page, row.getByTestId(RowAction.Delete), "dialog-delete-model-content");
    await expectSingleSuccessToast(page, deletedToastTitle);
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
  uniqueViolation,
  errorMessage,
  deletedToastTitle,
}: WorkflowRestoreTakenParams) {
  const table = page.getByTestId(tableTestId);
  const row = getTableRowByTestId(table, id);

  await page.goto(url);
  await openAndConfirmAlertDialog(page, row.getByTestId(RowAction.Delete), "dialog-delete-model-content");
  await expectSingleSuccessToast(page, deletedToastTitle);
  await expect(row).toHaveCount(0);

  await insertDuplicate();
  await toggleDeletedFilter(page, table, filterLabel, true);

  await openAndConfirmAlertDialog(page, row.getByTestId(RowAction.Restore), "dialog-restore-model-content");
  await expectSingleToast(page, errorMessage);
  expectUniqueViolationRejected(uniqueViolation, errorMessage);

  await expect(row.getByTestId(RowAction.Restore)).toBeVisible();
  await expect(row.getByTestId(RowAction.Delete)).toHaveCount(0);
  expect(await getDeletedAt(id)).toBeInstanceOf(Date);
}
