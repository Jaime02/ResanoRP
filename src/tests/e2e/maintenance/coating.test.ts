import { expect } from "@playwright/test";
import { eq } from "drizzle-orm";

import { getCoatingById } from "@/db/functions/coating";
import { COATING_NAME_CONSTRAINT, dbTableCoating } from "@/db/schema";
import { COATING_CREATE_TITLE, COATING_RESTORED_MESSAGE, SHOW_DELETED_COATINGS_LABEL } from "@/messages/coating";
import { COATING_LABEL, NAME_LABEL } from "@/messages/common";
import { mockCoatings, mockParts } from "@/tests/mock-data";
import { openAndConfirmAlertDialog } from "@/tests/utils/components/alert-dialog";
import { assertComboboxValue } from "@/tests/utils/components/combobox";
import { InputElementType, assertFormLoaded, getFormInputByLabel } from "@/tests/utils/components/form";
import {
  filterByExactText,
  findTableRowByText,
  getTableRowByTestId,
  getTableRows,
} from "@/tests/utils/components/table";
import { expectSingleToast } from "@/tests/utils/components/toast";
import { uniqueNameViolation } from "@/tests/utils/errors-log";
import { test } from "@/tests/utils/fixtures";
import {
  EditButtonVisibility,
  workflowDeletedFilterAndRestore,
  workflowRestoreTaken,
} from "@/tests/workflows/deleted-filter";
import {
  workflowRejectCreateWithTakenName,
  workflowRejectRenameToTakenName,
  workflowReuseDeletedName,
} from "@/tests/workflows/unique-name";
import type { BasePart } from "@/types/part";

const MAINTENANCE_COATING_URL = "/maintenance?tab=coating";
const NAME_TAKEN_MESSAGE = "Existe un Tratamiento con el mismo nombre";

test("manage the Tratamientos", async ({ page, db }) => {
  const activeCoatings = mockCoatings.filter((coating) => coating.deletedAt === null);
  const tableCoating = page.getByTestId("table-coating");
  const dialogCreateEditCoating = page.getByTestId("dialog-create-edit-coating");

  const openCreateCoating = async () => {
    await page.getByRole("button", { name: COATING_CREATE_TITLE }).click();
    await expect(dialogCreateEditCoating).toBeVisible();
  };
  const closeDialog = async () => {
    await dialogCreateEditCoating.getByTestId("button-close").click();
    await expect(dialogCreateEditCoating).not.toBeVisible();
  };

  await test.step("reject a Tratamiento with the name of any active one", async () => {
    await page.goto(MAINTENANCE_COATING_URL);

    await workflowRejectCreateWithTakenName({
      page,
      items: activeCoatings,
      form: dialogCreateEditCoating,
      openCreate: openCreateCoating,
      closeCreate: closeDialog,
      insertDuplicate: async (name) => db.insert(dbTableCoating).values({ name }),
      constraintName: COATING_NAME_CONSTRAINT,
      table: dbTableCoating,
      errorMessage: NAME_TAKEN_MESSAGE,
    });

    // A cancelled draft is kept
    await openCreateCoating();
    await expect(getFormInputByLabel(dialogCreateEditCoating, NAME_LABEL)).toHaveValue(activeCoatings.at(-1)!.name);
    await closeDialog();

    await workflowRejectRenameToTakenName({
      page,
      items: activeCoatings,
      form: dialogCreateEditCoating,
      openEdit: async (coating) =>
        (await findTableRowByText(tableCoating, coating.name)).getByTestId("button-edit").click(),
      closeEdit: closeDialog,
      getName: async (id) => (await getCoatingById(id))?.name,
      table: dbTableCoating,
      constraintName: COATING_NAME_CONSTRAINT,
      errorMessage: NAME_TAKEN_MESSAGE,
    });
  });

  await test.step("deleting every Tratamiento frees its name and removes it from its Artículos", async () => {
    // Deleting a Tratamiento shared by several Artículos clears all of them
    expect(
      activeCoatings.some((coating) => mockParts.filter((part) => part.coatingId === coating.id).length > 1),
      "Wrong test set up: Some Tratamiento should be used by several Artículos",
    ).toBe(true);

    const deletedCoatingIds = new Set<number>();
    const getExpectedCoatingId = (part: BasePart) =>
      part.coatingId !== null && deletedCoatingIds.has(part.coatingId) ? null : part.coatingId;
    const tablePart = page.getByTestId("table-part");
    const formPart = page.getByTestId("form-part");

    for (const coating of activeCoatings) {
      await page.goto(MAINTENANCE_COATING_URL);
      await openAndConfirmAlertDialog(
        page,
        (await findTableRowByText(tableCoating, coating.name)).getByTestId("button-delete"),
        "dialog-delete-model-content",
      );
      await expectSingleToast(page);
      deletedCoatingIds.add(coating.id);

      await expect(filterByExactText(getTableRows(tableCoating), coating.name)).toHaveCount(0);
      for (const otherCoating of activeCoatings.filter((activeCoating) => !deletedCoatingIds.has(activeCoating.id))) {
        await expect(filterByExactText(getTableRows(tableCoating), otherCoating.name)).toHaveCount(1);
      }
      expect((await getCoatingById(coating.id))?.deletedAt).toBeInstanceOf(Date);

      // Only the Artículos of the deleted Tratamientos lose theirs, including the deleted Artículos
      expect(
        await db.query.dbTablePart.findMany({ columns: { coatingId: true, id: true }, orderBy: { id: "asc" } }),
      ).toEqual(mockParts.map((part) => ({ coatingId: getExpectedCoatingId(part), id: part.id })));

      // Its name can be used again, so the deleted Tratamiento can no longer be restored
      await workflowReuseDeletedName({
        page,
        item: coating,
        form: dialogCreateEditCoating,
        openCreate: openCreateCoating,
        restoreDeleted: async () =>
          db.update(dbTableCoating).set({ deletedAt: null }).where(eq(dbTableCoating.id, coating.id)),
        constraintName: COATING_NAME_CONSTRAINT,
      });
      await expect(filterByExactText(getTableRows(tableCoating), coating.name)).toHaveCount(1);

      // The create dialog starts empty after a Tratamiento is created
      await openCreateCoating();
      await expect(getFormInputByLabel(dialogCreateEditCoating, NAME_LABEL)).toHaveValue("");
      await closeDialog();

      await page.goto("/part");
      for (const part of mockParts.filter((mockPart) => mockPart.deletedAt === null)) {
        const expectedCoatingId = getExpectedCoatingId(part);
        const cellCoating = getTableRowByTestId(tablePart, part.id).getByTestId("coating");
        await (expectedCoatingId === null
          ? expect(cellCoating).toBeEmpty()
          : expect(cellCoating).toHaveText(
              mockCoatings.find((mockCoating) => mockCoating.id === expectedCoatingId)!.name,
            ));
      }

      for (const part of mockParts.filter(
        (mockPart) => mockPart.deletedAt === null && mockPart.coatingId === coating.id,
      )) {
        await page.goto(`/part/${part.id}`);
        await assertFormLoaded(formPart);
        await assertComboboxValue(getFormInputByLabel(formPart, COATING_LABEL, InputElementType.Combobox), null);
      }
    }
  });
});

const DELETED_COATING_FILTER_PARAMS = {
  url: MAINTENANCE_COATING_URL,
  tableTestId: "table-coating",
  filterLabel: SHOW_DELETED_COATINGS_LABEL,
  getDeletedAt: async (id: number) => (await getCoatingById(id))?.deletedAt,
};

test("list the deleted Tratamientos only when asked for and restore them from the table", async ({ page }) => {
  await workflowDeletedFilterAndRestore({
    ...DELETED_COATING_FILTER_PARAMS,
    page,
    ids: mockCoatings.filter((coating) => coating.deletedAt === null).map(({ id }) => id),
    editButton: EditButtonVisibility.OnlyActive,
    restoredToastTitle: COATING_RESTORED_MESSAGE,
  });
});

test("a deleted Tratamiento cannot be restored from the table while another one has its name", async ({ page, db }) => {
  const coating = mockCoatings.find((mockCoating) => mockCoating.deletedAt === null)!;
  await workflowRestoreTaken({
    ...DELETED_COATING_FILTER_PARAMS,
    page,
    id: coating.id,
    insertDuplicate: async () => db.insert(dbTableCoating).values({ name: coating.name }),
    uniqueViolation: uniqueNameViolation(COATING_NAME_CONSTRAINT, dbTableCoating, coating.name),
    errorMessage: NAME_TAKEN_MESSAGE,
  });
});
