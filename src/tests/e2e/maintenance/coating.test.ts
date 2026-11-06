import { expect } from "@playwright/test";
import { eq } from "drizzle-orm";

import { getCoatingById } from "@/db/functions/coating";
import { COATING_NAME_CONSTRAINT, dbTableCoating } from "@/db/schema";
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
import { clearToasts, getToastType } from "@/tests/utils/components/toast";
import { expectUniqueViolation } from "@/tests/utils/db";
import { TestAnnotations, test } from "@/tests/utils/fixtures";
import {
  EditButtonVisibility,
  workflowDeletedFilterAndRestore,
  workflowRestoreTaken,
} from "@/tests/workflows/deleted-filter";
import { ToastType } from "@/types";
import type { BasePart } from "@/types/part";

const MAINTENANCE_COATING_URL = "/maintenance?tab=coating";

test("manage the Tratamientos", { annotation: TestAnnotations.NonEmptyErrorsLogFile }, async ({ page, db, toasts }) => {
  const activeCoatings = mockCoatings.filter((coating) => coating.deletedAt === null);
  const tableCoating = page.getByTestId("table-coating");
  const dialogCreateEditCoating = page.getByTestId("dialog-create-edit-coating");

  const createCoating = async (name: string) => {
    await page.getByRole("button", { name: "Crear Tratamiento" }).click();
    await expect(dialogCreateEditCoating).toBeVisible();
    await getFormInputByLabel(dialogCreateEditCoating, NAME_LABEL).fill(name);
    await dialogCreateEditCoating.getByTestId("button-submit").click();
  };

  await test.step("reject a Tratamiento with the name of any active one", async () => {
    await page.goto(MAINTENANCE_COATING_URL);

    for (const coating of activeCoatings) {
      await createCoating(coating.name);

      await expect(toasts).toHaveCount(1);
      expect(await getToastType(toasts.first())).toBe(ToastType.Error);
      await expect(toasts.first()).toContainText("Existe un Tratamiento con el mismo nombre");
      await expect(dialogCreateEditCoating).toBeVisible();

      await expectUniqueViolation(db.insert(dbTableCoating).values({ name: coating.name }), COATING_NAME_CONSTRAINT);

      await clearToasts(page);
      await dialogCreateEditCoating.getByTestId("button-close").click();
      await expect(dialogCreateEditCoating).not.toBeVisible();
    }

    // A cancelled draft is kept
    await page.getByRole("button", { name: "Crear Tratamiento" }).click();
    await expect(getFormInputByLabel(dialogCreateEditCoating, NAME_LABEL)).toHaveValue(activeCoatings.at(-1)!.name);
    await dialogCreateEditCoating.getByTestId("button-close").click();
    await expect(dialogCreateEditCoating).not.toBeVisible();
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
      deletedCoatingIds.add(coating.id);

      await expect(filterByExactText(getTableRows(tableCoating), coating.name)).toHaveCount(0);
      for (const otherCoating of activeCoatings.filter((activeCoating) => !deletedCoatingIds.has(activeCoating.id))) {
        await expect(filterByExactText(getTableRows(tableCoating), otherCoating.name)).toHaveCount(1);
      }
      expect((await getCoatingById(coating.id))?.deletedAt).not.toBeNull();

      // Only the Artículos of the deleted Tratamientos lose theirs, including the deleted Artículos
      expect(
        await db.query.dbTablePart.findMany({ columns: { coatingId: true, id: true }, orderBy: { id: "asc" } }),
      ).toEqual(mockParts.map((part) => ({ coatingId: getExpectedCoatingId(part), id: part.id })));

      // Its name can be used again...
      await createCoating(coating.name);
      await expect(dialogCreateEditCoating).not.toBeVisible();
      await expect(filterByExactText(getTableRows(tableCoating), coating.name)).toHaveCount(1);

      // ...the create dialog starts empty after a Tratamiento is created...
      await page.getByRole("button", { name: "Crear Tratamiento" }).click();
      await expect(getFormInputByLabel(dialogCreateEditCoating, NAME_LABEL)).toHaveValue("");
      await dialogCreateEditCoating.getByTestId("button-close").click();
      await expect(dialogCreateEditCoating).not.toBeVisible();

      // ...so the deleted Tratamiento can no longer be restored
      await expectUniqueViolation(
        db.update(dbTableCoating).set({ deletedAt: null }).where(eq(dbTableCoating.id, coating.id)),
        COATING_NAME_CONSTRAINT,
      );

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
  filterLabel: "Ver Tratamientos eliminados",
  getDeletedAt: async (id: number) => (await getCoatingById(id))?.deletedAt,
};

test("list the deleted Tratamientos only when asked for and restore them from the table", async ({ page }) => {
  await workflowDeletedFilterAndRestore({
    ...DELETED_COATING_FILTER_PARAMS,
    page,
    ids: mockCoatings.filter((coating) => coating.deletedAt === null).map(({ id }) => id),
    editButton: EditButtonVisibility.OnlyActive,
    restoredToastTitle: "Tratamiento restaurado",
  });
});

test(
  "a deleted Tratamiento cannot be restored from the table while another one has its name",
  { annotation: TestAnnotations.NonEmptyErrorsLogFile },
  async ({ page, db }) => {
    const coating = mockCoatings.find((mockCoating) => mockCoating.deletedAt === null)!;
    await workflowRestoreTaken({
      ...DELETED_COATING_FILTER_PARAMS,
      page,
      id: coating.id,
      insertDuplicate: async () => db.insert(dbTableCoating).values({ name: coating.name }),
      errorMessage: "Existe un Tratamiento con el mismo nombre",
    });
  },
);
