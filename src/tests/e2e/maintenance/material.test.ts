import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { eq } from "drizzle-orm";

import type { TDatabase } from "@/db";
import { MATERIAL_COMBINATION_CONSTRAINT, SHAPE_NAME_CONSTRAINT, dbTableMaterial, dbTableShape } from "@/db/schema";
import { mockMaterials, mockRawMaterials, mockShapes } from "@/tests/mock-data";
import { openAndConfirmAlertDialog } from "@/tests/utils/components/alert-dialog";
import {
  clickInComboboxOption,
  fillComboboxFilter,
  getClearComboboxButton,
  openCombobox,
} from "@/tests/utils/components/combobox";
import { InputElementType, getFormInputByLabel } from "@/tests/utils/components/form";
import { assertTableRowCount, getTableNoDataRow, getTableRowByTestId } from "@/tests/utils/components/table";
import { clearToasts, getToastType } from "@/tests/utils/components/toast";
import { expectUniqueViolation } from "@/tests/utils/db";
import { TestAnnotations, test } from "@/tests/utils/fixtures";
import {
  EditButtonVisibility,
  workflowDeletedFilterAndRestore,
  workflowRestoreTaken,
} from "@/tests/workflows/deleted-filter";
import {
  MATERIAL_DELETED_MESSAGE,
  assertInactiveMaterialWarning,
  assertPartsMaterialsState,
  getMockPartsShowingMaterials,
} from "@/tests/workflows/material";
import type { TDeletedMaterials } from "@/tests/workflows/material";
import { ToastType } from "@/types";

const MAINTENANCE_MATERIAL_URL = "/maintenance?tab=material";

async function getMaterial(db: TDatabase, id: number) {
  return db.query.dbTableMaterial.findFirst({ where: { id } });
}

async function fillMaterialForm(page: Page, material: (typeof mockMaterials)[number]) {
  const dialogCreateMaterial = page.getByTestId("dialog-create-material");
  const rawMaterial = mockRawMaterials.find((mockRawMaterial) => mockRawMaterial.id === material.rawMaterialId);
  const shape = mockShapes.find((mockShape) => mockShape.id === material.shapeId);
  expect(rawMaterial).toBeDefined();
  expect(shape).toBeDefined();

  const comboboxRawMaterial = getFormInputByLabel(dialogCreateMaterial, "Materia prima", InputElementType.Combobox);
  await openCombobox(comboboxRawMaterial);
  await fillComboboxFilter(page, rawMaterial!.name);
  await clickInComboboxOption(page, rawMaterial!.name);

  const comboboxShape = getFormInputByLabel(dialogCreateMaterial, "Forma", InputElementType.Combobox);
  await openCombobox(comboboxShape);
  await fillComboboxFilter(page, shape!.name);
  await clickInComboboxOption(page, shape!.name);

  const inputWidth = dialogCreateMaterial.locator("#input-width-create-material");
  await inputWidth.clear();
  await inputWidth.pressSequentially(material.width);
}

test("manage the Materiales", { annotation: TestAnnotations.NonEmptyErrorsLogFile }, async ({ page, db, toasts }) => {
  const activeMaterials = mockMaterials.filter((material) => material.deletedAt === null);
  const tableMaterial = page.getByTestId("table-material");

  const expectVisibleMaterials = async (materialIds: Array<number>) => {
    if (materialIds.length === 0) {
      await expect(getTableNoDataRow(tableMaterial)).toBeVisible();
      return;
    }
    await assertTableRowCount(tableMaterial, materialIds.length);
    for (const materialId of materialIds) {
      await expect(getTableRowByTestId(tableMaterial, materialId)).toBeVisible();
    }
  };

  await test.step("filter materials by shape", async () => {
    expect(
      mockShapes.some((shape) => activeMaterials.some((material) => material.shapeId === shape.id)),
      "Wrong test set up: Some Forma should have Materiales",
    ).toBe(true);

    await page.goto(MAINTENANCE_MATERIAL_URL);
    await expectVisibleMaterials(activeMaterials.map(({ id }) => id));

    const comboboxShapeFilter = tableMaterial.getByTestId("combobox-filter-shape");
    for (const shape of mockShapes) {
      await openCombobox(comboboxShapeFilter);
      await clickInComboboxOption(page, shape.name);
      await expectVisibleMaterials(
        activeMaterials.filter((material) => material.shapeId === shape.id).map(({ id }) => id),
      );

      await getClearComboboxButton(comboboxShapeFilter).click();
      await expectVisibleMaterials(activeMaterials.map(({ id }) => id));
      await expect(page).toHaveURL(MAINTENANCE_MATERIAL_URL);
    }
  });

  await test.step("filter materials by the numeric value of their width, keeping the filter in the URL", async () => {
    // The same width as another Material, stored with another scale. Both can only share it if their combination differs
    const material = activeMaterials[0];
    const otherScaleMaterial = activeMaterials.find(
      (activeMaterial) =>
        activeMaterial.rawMaterialId !== material.rawMaterialId || activeMaterial.shapeId !== material.shapeId,
    )!;
    const otherScaleWidth = `${material.width}.0`;
    const setOtherScaleMaterialWidth = async (width: string) =>
      db.update(dbTableMaterial).set({ width }).where(eq(dbTableMaterial.id, otherScaleMaterial.id));
    await setOtherScaleMaterialWidth(otherScaleWidth);
    const materialWidths = activeMaterials.map((activeMaterial) => ({
      id: activeMaterial.id,
      width: Number(activeMaterial.id === otherScaleMaterial.id ? otherScaleWidth : activeMaterial.width),
    }));
    expect(materialWidths.filter(({ width }) => width === Number(material.width))).toHaveLength(2);

    await page.goto(MAINTENANCE_MATERIAL_URL);
    const inputWidth = tableMaterial.getByTestId("input-filter-width");
    for (const width of new Set(materialWidths.map((materialWidth) => materialWidth.width))) {
      const expectedMaterialIds = materialWidths
        .filter((materialWidth) => materialWidth.width === width)
        .map(({ id }) => id);
      await inputWidth.clear();
      await inputWidth.pressSequentially(String(width));
      await expect(inputWidth).toHaveValue(String(width).replace(".", ","));
      await expectVisibleMaterials(expectedMaterialIds);

      await page.reload();
      await expect(inputWidth).toHaveValue(String(width).replace(".", ","));
      await expectVisibleMaterials(expectedMaterialIds);
    }

    await inputWidth.clear();
    await expectVisibleMaterials(activeMaterials.map(({ id }) => id));
    await expect(page).toHaveURL(MAINTENANCE_MATERIAL_URL);

    await setOtherScaleMaterialWidth(otherScaleMaterial.width);
  });

  // Formas are not maintained from the UI and cannot be deleted, so their name is only reachable through the database
  await test.step("keep the name of every Forma unique", async () => {
    for (const shape of mockShapes) {
      await expectUniqueViolation(db.insert(dbTableShape).values({ name: shape.name }), SHAPE_NAME_CONSTRAINT);
    }
  });

  await test.step("reject a Material with the combination of any active one", async () => {
    const dialogCreateMaterial = page.getByTestId("dialog-create-material");
    await page.goto(MAINTENANCE_MATERIAL_URL);

    for (const material of activeMaterials) {
      await page.getByRole("button", { name: "Crear Material" }).click();
      await expect(dialogCreateMaterial).toBeVisible();
      await fillMaterialForm(page, material);
      await dialogCreateMaterial.getByTestId("button-submit").click();

      await expect(toasts).toHaveCount(1);
      expect(await getToastType(toasts.first())).toBe(ToastType.Error);
      await expect(toasts.first()).toContainText("Existe un Material con la misma Materia Prima, Forma y ancho");
      await expect(dialogCreateMaterial).toBeVisible();

      await expectUniqueViolation(
        db
          .insert(dbTableMaterial)
          .values({ rawMaterialId: material.rawMaterialId, shapeId: material.shapeId, width: material.width }),
        MATERIAL_COMBINATION_CONSTRAINT,
      );

      await clearToasts(page);
      await dialogCreateMaterial.getByTestId("button-close").click();
      await expect(dialogCreateMaterial).not.toBeVisible();
    }
  });

  await test.step("a deleted Material is still shown in its Artículos, but it can no longer be added", async () => {
    const deleted: TDeletedMaterials = {
      materialIds: new Set(mockMaterials.filter((material) => material.deletedAt !== null).map(({ id }) => id)),
      rawMaterialIds: new Set(
        mockRawMaterials.filter((rawMaterial) => rawMaterial.deletedAt !== null).map(({ id }) => id),
      ),
    };

    for (const material of activeMaterials) {
      await page.goto(MAINTENANCE_MATERIAL_URL);
      await openAndConfirmAlertDialog(
        page,
        getTableRowByTestId(tableMaterial, material.id).getByTestId("button-delete"),
        "dialog-delete-model-content",
      );
      deleted.materialIds.add(material.id);

      await expectVisibleMaterials(
        activeMaterials.filter(({ id }) => !deleted.materialIds.has(id)).map(({ id }) => id),
      );
      expect(
        await db.query.dbTableMaterial.findMany({ columns: { deletedAt: true, id: true }, orderBy: { id: "asc" } }),
      ).toEqual(
        mockMaterials.map(({ deletedAt, id }) => ({
          deletedAt: deleted.materialIds.has(id) ? expect.any(Date) : deletedAt,
          id,
        })),
      );

      await assertPartsMaterialsState(page, getMockPartsShowingMaterials([material]), deleted);
    }
  });

  await test.step("creating the combination of a deleted Material restores it instead of storing a duplicate", async () => {
    const dialogCreateMaterial = page.getByTestId("dialog-create-material");
    const deleted: TDeletedMaterials = {
      materialIds: new Set(activeMaterials.map(({ id }) => id)),
      rawMaterialIds: new Set(
        mockRawMaterials.filter((rawMaterial) => rawMaterial.deletedAt !== null).map(({ id }) => id),
      ),
    };

    for (const material of activeMaterials) {
      await page.goto(MAINTENANCE_MATERIAL_URL);
      await page.getByRole("button", { name: "Crear Material" }).click();
      await expect(dialogCreateMaterial).toBeVisible();
      await fillMaterialForm(page, material);
      await dialogCreateMaterial.getByTestId("button-submit").click();
      await expect(dialogCreateMaterial).not.toBeVisible();
      deleted.materialIds.delete(material.id);

      await expectVisibleMaterials(
        activeMaterials.filter(({ id }) => !deleted.materialIds.has(id)).map(({ id }) => id),
      );
      expect((await getMaterial(db, material.id))?.deletedAt).toBeNull();
      expect(await db.select().from(dbTableMaterial)).toHaveLength(mockMaterials.length);

      await assertPartsMaterialsState(page, getMockPartsShowingMaterials([material]), deleted);
    }
  });
});

const DELETED_MATERIAL_FILTER_PARAMS = {
  url: MAINTENANCE_MATERIAL_URL,
  tableTestId: "table-material",
  filterLabel: "Ver Materiales eliminados",
};

test("list the deleted Materiales only when asked for and restore them from the table", async ({ page, db }) => {
  await workflowDeletedFilterAndRestore({
    ...DELETED_MATERIAL_FILTER_PARAMS,
    page,
    getDeletedAt: async (id) => (await getMaterial(db, id))?.deletedAt,
    ids: mockMaterials.filter((material) => material.deletedAt === null).map(({ id }) => id),
    editButton: EditButtonVisibility.Never,
    restoredToastTitle: "Material restaurado",
    // None of the mock Materias primas is deleted, so only the deleted Materiales are flagged
    assertRow: async (row, isDeleted) =>
      isDeleted
        ? assertInactiveMaterialWarning(page, row, MATERIAL_DELETED_MESSAGE)
        : expect(row.getByTestId("tooltip-inactive-material")).toHaveCount(0),
  });
});

test(
  "a deleted Material cannot be restored from the table while another one has its combination",
  { annotation: TestAnnotations.NonEmptyErrorsLogFile },
  async ({ page, db }) => {
    const material = mockMaterials.find((mockMaterial) => mockMaterial.deletedAt === null)!;
    await workflowRestoreTaken({
      ...DELETED_MATERIAL_FILTER_PARAMS,
      page,
      getDeletedAt: async (id) => (await getMaterial(db, id))?.deletedAt,
      id: material.id,
      insertDuplicate: async () =>
        db
          .insert(dbTableMaterial)
          .values({ rawMaterialId: material.rawMaterialId, shapeId: material.shapeId, width: material.width }),
      errorMessage: "Existe un Material con la misma Materia Prima, Forma y ancho",
    });
  },
);
