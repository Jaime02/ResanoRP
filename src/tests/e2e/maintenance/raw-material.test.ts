import { expect } from "@playwright/test";
import { eq } from "drizzle-orm";

import { RAW_MATERIAL_NAME_CONSTRAINT, dbTableRawMaterial } from "@/db/schema";
import { formatPrice } from "@/lib/formatters";
import { NAME_LABEL } from "@/messages/common";
import {
  RAW_MATERIAL_CREATE_TITLE,
  RAW_MATERIAL_RESTORED_MESSAGE,
  SHOW_DELETED_RAW_MATERIALS_LABEL,
  RAW_MATERIAL_DENSITY_LABEL,
  RAW_MATERIAL_PRICE_LABEL,
} from "@/messages/material";
import { mockMaterials, mockRawMaterials } from "@/tests/mock-data";
import { openAndConfirmAlertDialog } from "@/tests/utils/components/alert-dialog";
import { InputElementType, assertFormLoaded, getFormInputByLabel } from "@/tests/utils/components/form";
import {
  assertTableRowCount,
  filterByExactText,
  findTableRowByText,
  getTableNoDataRow,
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
  assertInactiveMaterialWarning,
  assertPartsMaterialsState,
  getExpectedInactiveMaterialMessage,
  getMockPartsShowingMaterials,
} from "@/tests/workflows/material";
import type { TDeletedMaterials } from "@/tests/workflows/material";
import {
  workflowRejectCreateWithTakenName,
  workflowRejectRenameToTakenName,
  workflowReuseDeletedName,
} from "@/tests/workflows/unique-name";
import type { BaseRawMaterial } from "@/types/raw-material";

const MAINTENANCE_RAW_MATERIAL_URL = "/maintenance?tab=rawMaterial";
const NAME_TAKEN_MESSAGE = "Existe una Materia Prima con el mismo nombre";

test("filter the Materias primas by name ignoring accents and case", async ({ page }) => {
  const brass = mockRawMaterials.find((rawMaterial) => rawMaterial.name.endsWith("Latón"))!;
  await page.goto(MAINTENANCE_RAW_MATERIAL_URL);
  const tableRawMaterial = page.getByTestId("table-raw-material");
  const inputFilterName = tableRawMaterial.getByTestId("input-filter-name");

  for (const filter of ["laton", "LATÓN"]) {
    await inputFilterName.fill(filter);
    await assertTableRowCount(tableRawMaterial, 1);
    await expect(getTableRowByTestId(tableRawMaterial, brass.id)).toBeVisible();
  }

  await inputFilterName.fill("latonx");
  await expect(getTableNoDataRow(tableRawMaterial)).toBeVisible();
});

test("manage the Materias primas", async ({ page, db }) => {
  const activeRawMaterials = mockRawMaterials.filter((rawMaterial) => rawMaterial.deletedAt === null);
  const tableRawMaterial = page.getByTestId("table-raw-material");
  const dialogCreateEditRawMaterial = page.getByTestId("dialog-create-edit-raw-material");

  const openCreateRawMaterial = async () => {
    await page.getByRole("button", { name: RAW_MATERIAL_CREATE_TITLE }).click();
    await expect(dialogCreateEditRawMaterial).toBeVisible();
  };
  const closeDialog = async () => {
    await dialogCreateEditRawMaterial.getByTestId("button-close").click();
    await expect(dialogCreateEditRawMaterial).not.toBeVisible();
  };
  const fillRawMaterial = async (rawMaterial: BaseRawMaterial, name: string) => {
    await getFormInputByLabel(dialogCreateEditRawMaterial, NAME_LABEL).fill(name);
    const inputPrice = getFormInputByLabel(
      dialogCreateEditRawMaterial,
      RAW_MATERIAL_PRICE_LABEL,
      InputElementType.Number,
    );
    await inputPrice.clear();
    await inputPrice.pressSequentially(rawMaterial.price ?? "1");
  };

  await test.step("reject a Materia prima with the name of any active one", async () => {
    await page.goto(MAINTENANCE_RAW_MATERIAL_URL);

    await workflowRejectCreateWithTakenName({
      page,
      items: activeRawMaterials,
      form: dialogCreateEditRawMaterial,
      openCreate: openCreateRawMaterial,
      closeCreate: closeDialog,
      fill: fillRawMaterial,
      insertDuplicate: async (name) => db.insert(dbTableRawMaterial).values({ name }),
      constraintName: RAW_MATERIAL_NAME_CONSTRAINT,
      table: dbTableRawMaterial,
      errorMessage: NAME_TAKEN_MESSAGE,
    });

    await workflowRejectRenameToTakenName({
      page,
      items: activeRawMaterials,
      form: dialogCreateEditRawMaterial,
      openEdit: async (rawMaterial) =>
        (await findTableRowByText(tableRawMaterial, rawMaterial.name)).getByTestId("button-edit").click(),
      closeEdit: closeDialog,
      getName: async (id) => (await db.query.dbTableRawMaterial.findFirst({ where: { id } }))?.name,
      table: dbTableRawMaterial,
      constraintName: RAW_MATERIAL_NAME_CONSTRAINT,
      errorMessage: NAME_TAKEN_MESSAGE,
    });
  });

  await test.step("edit every Materia prima", async () => {
    const formatDensity = (density: string | null) => (density === null ? "" : `${density.replace(".", ",")} g/cm³`);

    await page.goto(MAINTENANCE_RAW_MATERIAL_URL);
    for (const [index, rawMaterial] of activeRawMaterials.entries()) {
      const newName = `${rawMaterial.name} editada`;
      const newPrice = `${index + 1}.25`;
      const newDensity = `${index + 2}.5`;

      await (await findTableRowByText(tableRawMaterial, rawMaterial.name)).getByTestId("button-edit").click();
      await expect(dialogCreateEditRawMaterial).toBeVisible();
      await assertFormLoaded(dialogCreateEditRawMaterial);

      const inputName = getFormInputByLabel(dialogCreateEditRawMaterial, NAME_LABEL);
      const inputPrice = getFormInputByLabel(
        dialogCreateEditRawMaterial,
        RAW_MATERIAL_PRICE_LABEL,
        InputElementType.Number,
      );
      const inputDensity = getFormInputByLabel(
        dialogCreateEditRawMaterial,
        RAW_MATERIAL_DENSITY_LABEL,
        InputElementType.Number,
      );
      await expect(inputName).toHaveValue(rawMaterial.name);
      await expect(inputPrice).toHaveValue(formatPrice(rawMaterial.price, { replaceNBSP: true }));
      await expect(inputDensity).toHaveValue(formatDensity(rawMaterial.density));

      await inputName.fill(newName);
      await inputPrice.clear();
      await inputPrice.pressSequentially(newPrice);
      await inputDensity.clear();
      await inputDensity.pressSequentially(newDensity);
      await expect(inputName).toHaveValue(newName);
      await expect(inputPrice).toHaveValue(formatPrice(newPrice, { replaceNBSP: true }));
      await expect(inputDensity).toHaveValue(formatDensity(newDensity));
      await dialogCreateEditRawMaterial.getByTestId("button-submit").click();

      await expect(dialogCreateEditRawMaterial).not.toBeVisible();
      await expectSingleToast(page);
      await expect(filterByExactText(getTableRows(tableRawMaterial), newName)).toHaveCount(1);
      expect(await db.query.dbTableRawMaterial.findFirst({ where: { id: rawMaterial.id } })).toEqual({
        ...rawMaterial,
        density: newDensity,
        name: newName,
        price: newPrice,
      });
    }

    await Promise.all(
      activeRawMaterials.map(async ({ density, id, name, price }) =>
        db.update(dbTableRawMaterial).set({ density, name, price }).where(eq(dbTableRawMaterial.id, id)),
      ),
    );
  });

  await test.step("deleting every Materia prima frees its name and deactivates its Materiales", async () => {
    expect(
      activeRawMaterials.some((rawMaterial) =>
        mockMaterials.some((material) => material.rawMaterialId === rawMaterial.id),
      ),
      "Wrong test set up: Some Materia prima should have Materiales",
    ).toBe(true);

    const deleted: TDeletedMaterials = {
      materialIds: new Set(mockMaterials.filter((material) => material.deletedAt !== null).map(({ id }) => id)),
      rawMaterialIds: new Set(
        mockRawMaterials.filter((rawMaterial) => rawMaterial.deletedAt !== null).map(({ id }) => id),
      ),
    };
    const tableMaterial = page.getByTestId("table-material");

    for (const rawMaterial of activeRawMaterials) {
      const rawMaterialMaterials = mockMaterials.filter((material) => material.rawMaterialId === rawMaterial.id);

      await page.goto(MAINTENANCE_RAW_MATERIAL_URL);
      await openAndConfirmAlertDialog(
        page,
        (await findTableRowByText(tableRawMaterial, rawMaterial.name)).getByTestId("button-delete"),
        "dialog-delete-model-content",
      );
      await expectSingleToast(page);
      deleted.rawMaterialIds.add(rawMaterial.id);

      await expect(filterByExactText(getTableRows(tableRawMaterial), rawMaterial.name)).toHaveCount(0);
      for (const otherRawMaterial of activeRawMaterials.filter(({ id }) => !deleted.rawMaterialIds.has(id))) {
        await expect(filterByExactText(getTableRows(tableRawMaterial), otherRawMaterial.name)).toHaveCount(1);
      }
      expect(
        (await db.query.dbTableRawMaterial.findFirst({ where: { id: rawMaterial.id } }))?.deletedAt,
      ).toBeInstanceOf(Date);

      // The Materiales are not deleted, they are still listed with a warning
      expect(
        await db.query.dbTableMaterial.findMany({ columns: { deletedAt: true, id: true }, orderBy: { id: "asc" } }),
      ).toEqual(mockMaterials.map(({ deletedAt, id }) => ({ deletedAt, id })));

      await page.goto("/maintenance?tab=material");
      for (const material of mockMaterials.filter(({ id }) => !deleted.materialIds.has(id))) {
        const rowMaterial = getTableRowByTestId(tableMaterial, material.id);
        const message = getExpectedInactiveMaterialMessage(material, deleted);
        await (rawMaterialMaterials.includes(material)
          ? assertInactiveMaterialWarning(page, rowMaterial, message!)
          : expect(rowMaterial.getByTestId("tooltip-inactive-material")).toHaveCount(message === null ? 0 : 1));
      }

      await assertPartsMaterialsState(page, getMockPartsShowingMaterials(rawMaterialMaterials), deleted);

      // Its name can be used again, so the deleted Materia prima can no longer be restored
      await page.goto(MAINTENANCE_RAW_MATERIAL_URL);
      await workflowReuseDeletedName({
        page,
        item: rawMaterial,
        form: dialogCreateEditRawMaterial,
        openCreate: openCreateRawMaterial,
        fill: fillRawMaterial,
        restoreDeleted: async () =>
          db.update(dbTableRawMaterial).set({ deletedAt: null }).where(eq(dbTableRawMaterial.id, rawMaterial.id)),
        constraintName: RAW_MATERIAL_NAME_CONSTRAINT,
      });
      await expect(filterByExactText(getTableRows(tableRawMaterial), rawMaterial.name)).toHaveCount(1);
    }
  });
});

const DELETED_RAW_MATERIAL_FILTER_PARAMS = {
  url: MAINTENANCE_RAW_MATERIAL_URL,
  tableTestId: "table-raw-material",
  filterLabel: SHOW_DELETED_RAW_MATERIALS_LABEL,
};

test("list the deleted Materias primas only when asked for and restore them from the table", async ({ page, db }) => {
  await workflowDeletedFilterAndRestore({
    ...DELETED_RAW_MATERIAL_FILTER_PARAMS,
    page,
    getDeletedAt: async (id) => (await db.query.dbTableRawMaterial.findFirst({ where: { id } }))?.deletedAt,
    ids: mockRawMaterials.filter((rawMaterial) => rawMaterial.deletedAt === null).map(({ id }) => id),
    editButton: EditButtonVisibility.OnlyActive,
    restoredToastTitle: RAW_MATERIAL_RESTORED_MESSAGE,
  });
});

test("a deleted Materia prima cannot be restored from the table while another one has its name", async ({
  page,
  db,
}) => {
  const rawMaterial = mockRawMaterials.find((mockRawMaterial) => mockRawMaterial.deletedAt === null)!;
  await workflowRestoreTaken({
    ...DELETED_RAW_MATERIAL_FILTER_PARAMS,
    page,
    getDeletedAt: async (id) => (await db.query.dbTableRawMaterial.findFirst({ where: { id } }))?.deletedAt,
    id: rawMaterial.id,
    insertDuplicate: async () => db.insert(dbTableRawMaterial).values({ name: rawMaterial.name }),
    uniqueViolation: uniqueNameViolation(RAW_MATERIAL_NAME_CONSTRAINT, dbTableRawMaterial, rawMaterial.name),
    errorMessage: NAME_TAKEN_MESSAGE,
  });
});
