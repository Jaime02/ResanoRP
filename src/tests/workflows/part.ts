import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

import { getPartById, getPartComponentsOfPart, getPartFeaturesOfPart } from "@/db/functions/part";
import { PART_FEATURE_LABEL } from "@/messages/part";
import { openAndConfirmAlertDialog } from "@/tests/utils/components/alert-dialog";
import { assertFormLoaded, getFormInputByLabel } from "@/tests/utils/components/form";
import { openPartPicker } from "@/tests/utils/components/picker";
import { getEditableCellById, getTableRowByTestId } from "@/tests/utils/components/table";
import { expectSingleToast } from "@/tests/utils/components/toast";
import { getMockActivePartSetsOfPart } from "@/tests/utils/mock-data-utils";

export async function workflowDeletePart(page: Page, partId: number, expectedErrorMessage?: string) {
  const rowPart = getTableRowByTestId(page.getByTestId("table-part"), partId);
  await page.goto("/part");
  await expect(rowPart).toBeVisible();
  expect((await getPartById(partId))?.deletedAt).toBeNull();

  await openAndConfirmAlertDialog(page, rowPart.getByTestId("button-delete"), "dialog-delete-model-content");

  if (expectedErrorMessage !== undefined) {
    await expectSingleToast(page, expectedErrorMessage);
    await expect(rowPart).toBeVisible();
    expect((await getPartById(partId))?.deletedAt).toBeNull();
    return;
  }
  await expect(rowPart).not.toBeVisible();
  expect((await getPartById(partId))?.deletedAt).not.toBeNull();
}

export async function gotoPartComponents(page: Page, partId: number) {
  await page.goto(`/part/${partId}?tab=components`);
  const formPart = page.getByTestId("form-part");
  await assertFormLoaded(formPart);
  return formPart.getByTestId("table-part-components");
}

export async function getPartComponentQuantity(parentPartId: number, componentPartId: number) {
  return (await getPartComponentsOfPart(parentPartId)).find(
    (partComponent) => partComponent.componentPartId === componentPartId,
  )?.quantity;
}

export async function workflowCreatePartComponent(
  page: Page,
  { parentPartId, componentPartId, quantity }: { parentPartId: number; componentPartId: number; quantity: number },
  expectedErrorMessage?: string,
) {
  const previousQuantity = await getPartComponentQuantity(parentPartId, componentPartId);
  const tablePartComponents = await gotoPartComponents(page, parentPartId);
  await tablePartComponents.getByTestId("button-create-part-component").click();
  const dialog = page.getByTestId("dialog-create-part-component");
  await expect(dialog).toBeVisible();
  const { dialogPickerPartContent, tablePickerPart } = await openPartPicker(
    page,
    dialog.getByTestId("picker-create-part-component"),
  );
  await getTableRowByTestId(tablePickerPart, componentPartId).getByTestId("button-success").click();
  await expect(dialogPickerPartContent).not.toBeVisible();
  await dialog.getByTestId("input-create-part-component-quantity").pressSequentially(String(quantity));
  await dialog.getByTestId("button-submit").click();
  await expectSingleToast(page, expectedErrorMessage);

  if (expectedErrorMessage !== undefined) {
    await expect(dialog).toBeVisible();
    expect(await getPartComponentQuantity(parentPartId, componentPartId)).toBe(previousQuantity);
    return;
  }
  await expect(dialog).toBeHidden();
  await expect(getEditableCellById(getTableRowByTestId(tablePartComponents, componentPartId), "quantity")).toHaveValue(
    String(quantity),
  );
  expect(await getPartComponentQuantity(parentPartId, componentPartId)).toBe(quantity);
}

export async function workflowDeletePartComponent(page: Page, parentPartId: number, componentPartId: number) {
  const tablePartComponents = await gotoPartComponents(page, parentPartId);
  const rowPartComponent = getTableRowByTestId(tablePartComponents, componentPartId);
  await openAndConfirmAlertDialog(page, rowPartComponent.getByTestId("button-delete"), "dialog-delete-model-content");
  await expectSingleToast(page);
  await expect(rowPartComponent).toHaveCount(0);
  expect(await getPartComponentQuantity(parentPartId, componentPartId)).toBeUndefined();
}

// A component of an active set cannot be deleted, so it is taken out of the sets of the mock data first
export async function workflowRemovePartFromActiveSets(page: Page, partId: number) {
  for (const partSet of getMockActivePartSetsOfPart(partId)) {
    await workflowDeletePartComponent(page, partSet.id, partId);
  }
}

async function gotoPartFeatures(page: Page, partId: number) {
  await page.goto(`/part/${partId}?tab=blueprints`);
  const formPart = page.getByTestId("form-part");
  await assertFormLoaded(formPart);
  return formPart.getByTestId("table-part-features");
}

export async function workflowCreatePartFeature(page: Page, partId: number, feature: string) {
  await gotoPartFeatures(page, partId);
  await page.getByTestId("form-part").getByTestId("button-create-part-feature").click();
  const dialogCreatePartFeature = page.getByTestId("dialog-create-part-feature");
  await expect(dialogCreatePartFeature).toBeVisible();
  await getFormInputByLabel(dialogCreatePartFeature, PART_FEATURE_LABEL).fill(feature);
  await dialogCreatePartFeature.getByTestId("button-submit").click();
  await expect(dialogCreatePartFeature).toBeHidden();
  await expectSingleToast(page);
  const createdFeature = (await getPartFeaturesOfPart(partId)).find((partFeature) => partFeature.feature === feature);
  expect(createdFeature).toBeDefined();
  return createdFeature!;
}

export async function workflowDeletePartFeature(
  page: Page,
  partId: number,
  partFeatureId: number,
  expectedErrorMessage?: string,
) {
  const tablePartFeatures = await gotoPartFeatures(page, partId);
  await openAndConfirmAlertDialog(
    page,
    getTableRowByTestId(tablePartFeatures, partFeatureId).getByTestId("button-delete"),
    "dialog-delete-model-content",
  );
  await expectSingleToast(page, expectedErrorMessage);
  const isDeleted = (await getPartFeaturesOfPart(partId)).every((partFeature) => partFeature.id !== partFeatureId);
  expect(isDeleted).toBe(expectedErrorMessage === undefined);
  await expect(getTableRowByTestId(tablePartFeatures, partFeatureId)).toHaveCount(
    expectedErrorMessage === undefined ? 0 : 1,
  );
}
