import { expect } from "@playwright/test";
import { eq } from "drizzle-orm";

import { RAW_MATERIAL_NAME_CONSTRAINT, dbTableRawMaterial } from "@/db/schema";
import { formatPrice } from "@/lib/formatters";
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
import { clearToasts, getToastType } from "@/tests/utils/components/toast";
import { expectUniqueViolation } from "@/tests/utils/db";
import { TestAnnotations, test } from "@/tests/utils/fixtures";
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
import { ToastType } from "@/types";
import type { BaseRawMaterial } from "@/types/raw-material";

const MAINTENANCE_RAW_MATERIAL_URL = "/maintenance?tab=rawMaterial";

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

test(
  "manage the Materias primas",
  { annotation: TestAnnotations.NonEmptyErrorsLogFile },
  async ({ page, db, toasts }) => {
    const activeRawMaterials = mockRawMaterials.filter((rawMaterial) => rawMaterial.deletedAt === null);
    const tableRawMaterial = page.getByTestId("table-raw-material");
    const dialogCreateEditRawMaterial = page.getByTestId("dialog-create-edit-raw-material");

    const createRawMaterial = async (rawMaterial: BaseRawMaterial) => {
      await page.getByRole("button", { name: "Crear Materia prima" }).click();
      await expect(dialogCreateEditRawMaterial).toBeVisible();
      await getFormInputByLabel(dialogCreateEditRawMaterial, "Nombre").fill(rawMaterial.name);
      const inputPrice = getFormInputByLabel(dialogCreateEditRawMaterial, "Precio (€ / kg)", InputElementType.Number);
      await inputPrice.clear();
      await inputPrice.pressSequentially(rawMaterial.price ?? "1");
      await dialogCreateEditRawMaterial.getByTestId("button-submit").click();
    };

    await test.step("reject a Materia prima with the name of any active one", async () => {
      await page.goto(MAINTENANCE_RAW_MATERIAL_URL);

      for (const rawMaterial of activeRawMaterials) {
        await createRawMaterial(rawMaterial);

        await expect(toasts).toHaveCount(1);
        expect(await getToastType(toasts.first())).toBe(ToastType.Error);
        await expect(toasts.first()).toContainText("Existe una Materia Prima con el mismo nombre");
        await expect(dialogCreateEditRawMaterial).toBeVisible();

        await expectUniqueViolation(
          db.insert(dbTableRawMaterial).values({ name: rawMaterial.name }),
          RAW_MATERIAL_NAME_CONSTRAINT,
        );

        await clearToasts(page);
        await dialogCreateEditRawMaterial.getByTestId("button-close").click();
        await expect(dialogCreateEditRawMaterial).not.toBeVisible();
      }
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

        const inputName = getFormInputByLabel(dialogCreateEditRawMaterial, "Nombre");
        const inputPrice = getFormInputByLabel(dialogCreateEditRawMaterial, "Precio (€ / kg)", InputElementType.Number);
        const inputDensity = getFormInputByLabel(dialogCreateEditRawMaterial, "Densidad", InputElementType.Number);
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
        await expect(toasts).toHaveCount(1);
        expect(await getToastType(toasts.first())).toBe(ToastType.Success);
        await clearToasts(page);
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
        deleted.rawMaterialIds.add(rawMaterial.id);

        await expect(filterByExactText(getTableRows(tableRawMaterial), rawMaterial.name)).toHaveCount(0);
        for (const otherRawMaterial of activeRawMaterials.filter(({ id }) => !deleted.rawMaterialIds.has(id))) {
          await expect(filterByExactText(getTableRows(tableRawMaterial), otherRawMaterial.name)).toHaveCount(1);
        }
        expect(
          (await db.query.dbTableRawMaterial.findFirst({ where: { id: rawMaterial.id } }))?.deletedAt,
        ).not.toBeNull();

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

        // Its name can be used again...
        await page.goto(MAINTENANCE_RAW_MATERIAL_URL);
        await createRawMaterial(rawMaterial);
        await expect(dialogCreateEditRawMaterial).not.toBeVisible();
        await expect(filterByExactText(getTableRows(tableRawMaterial), rawMaterial.name)).toHaveCount(1);

        // ...so the deleted Materia prima can no longer be restored
        await expectUniqueViolation(
          db.update(dbTableRawMaterial).set({ deletedAt: null }).where(eq(dbTableRawMaterial.id, rawMaterial.id)),
          RAW_MATERIAL_NAME_CONSTRAINT,
        );
      }
    });
  },
);

const DELETED_RAW_MATERIAL_FILTER_PARAMS = {
  url: MAINTENANCE_RAW_MATERIAL_URL,
  tableTestId: "table-raw-material",
  filterLabel: "Ver Materias primas eliminadas",
};

test("list the deleted Materias primas only when asked for and restore them from the table", async ({ page, db }) => {
  await workflowDeletedFilterAndRestore({
    ...DELETED_RAW_MATERIAL_FILTER_PARAMS,
    page,
    getDeletedAt: async (id) => (await db.query.dbTableRawMaterial.findFirst({ where: { id } }))?.deletedAt,
    ids: mockRawMaterials.filter((rawMaterial) => rawMaterial.deletedAt === null).map(({ id }) => id),
    editButton: EditButtonVisibility.OnlyActive,
    restoredToastTitle: "Materia prima restaurada",
  });
});

test(
  "a deleted Materia prima cannot be restored from the table while another one has its name",
  { annotation: TestAnnotations.NonEmptyErrorsLogFile },
  async ({ page, db }) => {
    const rawMaterial = mockRawMaterials.find((mockRawMaterial) => mockRawMaterial.deletedAt === null)!;
    await workflowRestoreTaken({
      ...DELETED_RAW_MATERIAL_FILTER_PARAMS,
      page,
      getDeletedAt: async (id) => (await db.query.dbTableRawMaterial.findFirst({ where: { id } }))?.deletedAt,
      id: rawMaterial.id,
      insertDuplicate: async () => db.insert(dbTableRawMaterial).values({ name: rawMaterial.name }),
      errorMessage: "Existe una Materia Prima con el mismo nombre",
    });
  },
);
