import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

import { getPartFeaturesOfPart } from "@/db/functions/part";
import { getProductionOrderById } from "@/db/functions/production-order";
import { getQualityChecksOfProductionOrder } from "@/db/functions/quality-check";
import {
  mockMachineProductionOrderQueues,
  mockMachines,
  mockPartFeatures,
  mockProductionOrders,
  mockQualityChecks,
} from "@/tests/mock-data";
import { getTableRowByTestId, getTableRows } from "@/tests/utils/components/table";
import { expectSingleToast } from "@/tests/utils/components/toast";
import type { BasePartFeature } from "@/types/part-feature";
import type { BaseQualityCheck } from "@/types/quality-check";

export interface QualityControlState {
  checks: Array<BaseQualityCheck>;
  features: Array<BasePartFeature>;
}

export const getMockChecks = (productionOrderId: number) =>
  mockQualityChecks.filter((check) => check.productionOrderId === productionOrderId);
export const getMockFeatures = (partId: number) => mockPartFeatures.filter((feature) => feature.partId === partId);
export const getMockProductionOrder = (id: number) =>
  mockProductionOrders.find((productionOrder) => productionOrder.id === id)!;
export const findOrderWithFeatures = (predicate: (productionOrderId: number) => boolean) =>
  mockProductionOrders.find(
    (productionOrder) =>
      productionOrder.qualityControl &&
      getMockFeatures(productionOrder.partId).length > 0 &&
      predicate(productionOrder.id),
  )!;

export function getMockQualityControl(productionOrderId: number): QualityControlState {
  return {
    checks: getMockChecks(productionOrderId),
    features: getMockFeatures(getMockProductionOrder(productionOrderId).partId),
  };
}

export async function getDbQualityControl(productionOrderId: number): Promise<QualityControlState> {
  const productionOrder = (await getProductionOrderById(productionOrderId))!;
  return {
    checks: await getQualityChecksOfProductionOrder(productionOrderId),
    features: await getPartFeaturesOfPart(productionOrder.partId),
  };
}

// The checks saved together share their date, and each one is a column of the table
export function groupChecksByDate(checks: Array<BaseQualityCheck>) {
  const batches = new Map<
    number,
    { producedQuantity: number; results: Map<number, { notes: string | null; ok: boolean; value: string | null }> }
  >();
  for (const check of checks) {
    const batch = batches.get(check.checkedAt.getTime()) ?? {
      producedQuantity: check.producedQuantity,
      results: new Map(),
    };
    batch.results.set(check.partFeatureId, { notes: check.notes, ok: check.ok, value: check.value });
    batches.set(check.checkedAt.getTime(), batch);
  }
  return [...batches.values()];
}

export function getQualityControlLocators(page: Page) {
  const table = page.getByTestId("table-quality-control");
  const dialogCreate = page.getByTestId("dialog-quality-check-create");
  return {
    buttonConfirm: dialogCreate.getByTestId("button-confirm-quality-check"),
    buttonCreate: page.getByTestId("button-quality-check-create"),
    dialogCreate,
    inputQuantity: dialogCreate.getByTestId("input-quality-check-quantity"),
    table,
  };
}

export async function gotoQualityControl(page: Page, productionOrderId: number) {
  await page.goto(`/production-order/${productionOrderId}`);
  const { table } = getQualityControlLocators(page);
  await expect(table).toBeVisible();
  return table;
}

// The columns are the feature and one for each saved check
export async function assertQualityControlTable(
  page: Page,
  { checks, features }: QualityControlState,
  { editable }: { editable: boolean },
) {
  const { buttonCreate, table } = getQualityControlLocators(page);
  const batches = groupChecksByDate(checks);
  const columnHeaders = table.getByRole("columnheader");
  await expect(columnHeaders).toHaveCount(1 + batches.length);
  for (const [index, batch] of batches.entries()) {
    await expect(columnHeaders.nth(index + 1)).toHaveText(String(batch.producedQuantity));
  }
  await expect(getTableRows(table)).toHaveCount(features.length);
  for (const feature of features) {
    const row = getTableRowByTestId(table, feature.id);
    const cells = row.getByRole("cell");
    for (const [index, batch] of batches.entries()) {
      const cell = cells.nth(index + 1);
      const result = batch.results.get(feature.id);
      const hasValue = result?.value != null;
      const hasNotes = result?.notes != null;
      await expect(cell.getByTestId("quality-check-value")).toHaveCount(hasValue ? 1 : 0);
      if (hasValue) {
        await expect(cell.getByTestId("quality-check-value")).toHaveText(result.value!);
      }
      await expect(cell.getByRole("checkbox")).toHaveCount(result !== undefined && !hasValue && !hasNotes ? 1 : 0);
      await expect(cell.getByTestId("tooltip-quality-check-issue")).toHaveCount(hasNotes ? 1 : 0);
      if (result !== undefined && !hasValue && !hasNotes) {
        await (result.ok
          ? expect(cell.getByRole("checkbox")).toBeChecked()
          : expect(cell.getByRole("checkbox")).not.toBeChecked());
      }
    }
  }
  await expect(buttonCreate).toHaveCount(editable ? 1 : 0);
}

export const getQualityControlCheckbox = (page: Page) => page.getByTestId("form-production-order-quality-control");

export async function workflowSetQualityControl(page: Page, productionOrderId: number, qualityControl: boolean) {
  await page.goto(`/production-order/${productionOrderId}`);
  const checkbox = getQualityControlCheckbox(page);
  const buttonSubmit = page.getByTestId("button-submit");
  await expect(checkbox).toBeVisible();
  await expect(checkbox).toBeChecked({ checked: !qualityControl });
  await expect(buttonSubmit).toBeDisabled();
  await checkbox.click();
  await expect(checkbox).toBeChecked({ checked: qualityControl });
  await buttonSubmit.click();
  await expectSingleToast(page);
  await expect(checkbox).toBeChecked({ checked: qualityControl });
  await expect(getQualityControlLocators(page).table).toHaveCount(qualityControl ? 1 : 0);
}

export interface QualityCheckInput {
  values?: Record<number, string>;
  notes?: Record<number, string>;
  failedFeatureIds?: Array<number>;
}

export async function workflowFillQualityCheck(
  page: Page,
  producedQuantity: number,
  { values = {}, notes = {}, failedFeatureIds = [] }: QualityCheckInput = {},
) {
  const { buttonCreate, dialogCreate, inputQuantity } = getQualityControlLocators(page);
  await buttonCreate.click();
  await inputQuantity.fill(String(producedQuantity));
  await expect(inputQuantity).toHaveValue(String(producedQuantity));
  for (const [id, value] of Object.entries(values)) {
    await dialogCreate.getByTestId(`input-quality-check-value-${id}`).fill(value.replace(".", ","));
  }
  for (const [id, note] of Object.entries(notes)) {
    await dialogCreate.getByTestId(`input-quality-check-notes-${id}`).fill(note);
  }
  for (const id of failedFeatureIds) {
    await dialogCreate.getByTestId(`checkbox-quality-check-${id}`).click();
  }
}

export async function workflowCreateQualityCheck(
  page: Page,
  producedQuantity: number,
  expectedErrorMessage?: string,
  input?: QualityCheckInput,
) {
  const { buttonConfirm, dialogCreate } = getQualityControlLocators(page);
  await workflowFillQualityCheck(page, producedQuantity, input);
  await buttonConfirm.click();
  await expectSingleToast(page, expectedErrorMessage);
  if (expectedErrorMessage === undefined) {
    await expect(dialogCreate).toHaveCount(0);
  }
}

export const qualityControlMachine = mockMachines.find(
  (machine) =>
    machine.activeProductionOrderId !== null && getMockProductionOrder(machine.activeProductionOrderId).qualityControl,
)!;
export const qualityControlProductionOrder = getMockProductionOrder(qualityControlMachine.activeProductionOrderId!);
export const queuedProductionOrderWithoutFeatures = mockProductionOrders.find(
  (productionOrder) =>
    productionOrder.qualityControl &&
    getMockFeatures(productionOrder.partId).length === 0 &&
    mockMachineProductionOrderQueues.some(
      (queue) => queue.machineId === qualityControlMachine.id && queue.productionOrderId === productionOrder.id,
    ),
)!;
export const otherMachine = mockMachines.find(
  (machine) => machine.id !== qualityControlMachine.id && machine.activeProductionOrderId === null,
)!;
