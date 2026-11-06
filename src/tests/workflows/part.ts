import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

import { getPartById, getPartFeaturesOfPart } from "@/db/functions/part";
import { PART_FEATURE_LABEL } from "@/messages/part";
import { openAndConfirmAlertDialog } from "@/tests/utils/components/alert-dialog";
import { assertFormLoaded, getFormInputByLabel } from "@/tests/utils/components/form";
import { getTableRowByTestId } from "@/tests/utils/components/table";
import { expectSingleToast } from "@/tests/utils/components/toast";

export async function workflowDeletePart(page: Page, partId: number) {
  const rowPart = getTableRowByTestId(page.getByTestId("table-part"), partId);
  await page.goto("/part");
  await expect(rowPart).toBeVisible();
  expect((await getPartById(partId))?.deletedAt).toBeNull();

  await openAndConfirmAlertDialog(page, rowPart.getByTestId("button-delete"), "dialog-delete-model-content");

  await expect(rowPart).not.toBeVisible();
  expect((await getPartById(partId))?.deletedAt).not.toBeNull();
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
