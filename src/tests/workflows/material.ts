import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { INACTIVE_MATERIAL_DELETED_MESSAGE, INACTIVE_RAW_MATERIAL_DELETED_MESSAGE } from "@/messages/material";
import { NO_ACTIVE_MATERIALS_MESSAGE } from "@/messages/part-price";
import { mockMaterials, mockPartMaterials, mockPartPriceEstimators, mockParts } from "@/tests/mock-data";
import { openCombobox } from "@/tests/utils/components/combobox";
import { assertFormLoaded } from "@/tests/utils/components/form";
import { getPopoverContent } from "@/tests/utils/components/popover";
import { assertTableRowCount, getTableRowByTestId } from "@/tests/utils/components/table";
import type { BaseMaterial } from "@/types/material";
import type { BasePart } from "@/types/part";

export interface TDeletedMaterials {
  materialIds: Set<number>;
  rawMaterialIds: Set<number>;
}

export async function assertInactiveMaterialWarning(page: Page, container: Locator, message: string) {
  const tooltipInactiveMaterial = container.getByTestId("tooltip-inactive-material");
  await expect(tooltipInactiveMaterial).toBeVisible();

  await tooltipInactiveMaterial.hover();
  await expect(getPopoverContent(page)).toHaveText(message);

  await page.mouse.move(0, 0);
  await expect(getPopoverContent(page)).not.toBeVisible();
}

async function assertMaterialWarning(page: Page, container: Locator, message: string | null) {
  await (message === null
    ? expect(container.getByTestId("tooltip-inactive-material")).toHaveCount(0)
    : assertInactiveMaterialWarning(page, container, message));
}

export function getExpectedInactiveMaterialMessage(material: BaseMaterial, deleted: TDeletedMaterials): string | null {
  if (deleted.materialIds.has(material.id)) {
    return INACTIVE_MATERIAL_DELETED_MESSAGE;
  }
  if (deleted.rawMaterialIds.has(material.rawMaterialId)) {
    return INACTIVE_RAW_MATERIAL_DELETED_MESSAGE;
  }
  return null;
}

export function getMockPartMaterials(part: BasePart): Array<BaseMaterial> {
  return mockMaterials.filter((material) =>
    mockPartMaterials.some(
      (partMaterial) => partMaterial.partId === part.id && partMaterial.materialId === material.id,
    ),
  );
}

// A Material that could be added to the Artículo if it was active
function isMockMaterialCompatible(material: BaseMaterial, part: BasePart): boolean {
  return (
    material.shapeId === part.shapeId &&
    (part.width === null || Number(material.width) >= Number(part.width)) &&
    !getMockPartMaterials(part).includes(material)
  );
}

export function getMockPartsShowingMaterials(materials: Array<BaseMaterial>): Array<BasePart> {
  return mockParts.filter(
    (part) =>
      part.deletedAt === null &&
      materials.some(
        (material) => getMockPartMaterials(part).includes(material) || isMockMaterialCompatible(material, part),
      ),
  );
}

// The Artículos table, the Materiales of each Artículo and its price calculator warn about every inactive Material
export async function assertPartsMaterialsState(page: Page, parts: Array<BasePart>, deleted: TDeletedMaterials) {
  await page.goto("/part");
  const tablePart = page.getByTestId("table-part");
  for (const part of mockParts.filter((mockPart) => mockPart.deletedAt === null)) {
    await expect(getTableRowByTestId(tablePart, part.id).getByTestId("tooltip-inactive-material")).toHaveCount(
      getMockPartMaterials(part).filter((material) => getExpectedInactiveMaterialMessage(material, deleted) !== null)
        .length,
    );
  }

  const formPart = page.getByTestId("form-part");
  const tablePartMaterials = formPart.getByTestId("table-part-materials");
  const tableCompatiblePartMaterials = formPart.getByTestId("table-compatible-part-materials");
  const formEstimator = page.getByTestId("form-part-price-estimator");
  for (const part of parts) {
    const partMaterials = getMockPartMaterials(part);
    const activePartMaterials = partMaterials.filter(
      (material) => getExpectedInactiveMaterialMessage(material, deleted) === null,
    );

    await page.goto(`/part/${part.id}?tab=materials`);
    await assertFormLoaded(formPart);
    await assertTableRowCount(tablePartMaterials, partMaterials.length);
    for (const material of partMaterials) {
      await assertMaterialWarning(
        page,
        getTableRowByTestId(tablePartMaterials, material.id),
        getExpectedInactiveMaterialMessage(material, deleted),
      );
    }

    // Inactive Materiales can no longer be added
    const compatibleMaterials = mockMaterials.filter(
      (material) =>
        isMockMaterialCompatible(material, part) && getExpectedInactiveMaterialMessage(material, deleted) === null,
    );
    await assertTableRowCount(tableCompatiblePartMaterials, compatibleMaterials.length);
    for (const material of compatibleMaterials) {
      await expect(getTableRowByTestId(tableCompatiblePartMaterials, material.id)).toBeVisible();
    }

    // The price calculator keeps showing the saved Material, but it can only pick the active ones
    const estimator = mockPartPriceEstimators.find((partPriceEstimator) => partPriceEstimator.partId === part.id);
    if (estimator === undefined) {
      continue;
    }
    await page.goto(`/price-calculator/${part.id}`);
    await assertFormLoaded(formEstimator);
    const estimatorMaterial = mockMaterials.find((material) => material.id === estimator.materialId);
    if (estimatorMaterial !== undefined) {
      await assertMaterialWarning(
        page,
        formEstimator.getByTestId("table-estimator-material"),
        getExpectedInactiveMaterialMessage(estimatorMaterial, deleted),
      );
    }
    await openCombobox(formEstimator.getByTestId("combobox-estimator-material"));
    await expect(page.getByTestId("combobox-list").locator("[role='option']")).toHaveCount(activePartMaterials.length);
    if (activePartMaterials.length === 0) {
      await expect(page.getByText(NO_ACTIVE_MATERIALS_MESSAGE)).toBeVisible();
    }
    await page.keyboard.press("Escape");
  }
}
