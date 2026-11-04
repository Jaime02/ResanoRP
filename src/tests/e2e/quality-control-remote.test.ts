import { expect } from "@playwright/test";

import { UserMode } from "@/contexts/app-context";
import { getMachineById } from "@/db/functions/machine";
import { getMachineProductionOrderQueue } from "@/db/functions/machine-production-order-queue";
import { getProductionOrderById } from "@/db/functions/production-order";
import { ProductionOrderStatus } from "@/schemas/production-order";
import { InputElementType, getFormInputByLabel } from "@/tests/utils/components/form";
import { getTableRowByTestId } from "@/tests/utils/components/table";
import { expectSingleToast } from "@/tests/utils/components/toast";
import { TestAnnotations, test } from "@/tests/utils/fixtures";
import { workflowCreatePartFeature, workflowDeletePartFeature } from "@/tests/workflows/part";
import {
  gotoProductionOrdersWithStatuses,
  workflowDeleteProductionOrder,
  workflowOpenProduction,
  workflowRestoreProductionOrder,
  workflowRunProductionOrderOnMachines,
  workflowStartProductionOrderFromQueue,
  workflowStopActiveProductionOrder,
} from "@/tests/workflows/production";
import {
  assertQualityControlTable,
  getDbQualityControl,
  getMockQualityControl,
  getQualityControlLocators,
  gotoQualityControl,
  groupChecksByDate,
  otherMachine,
  qualityControlMachine,
  qualityControlProductionOrder,
  queuedProductionOrderWithoutFeatures,
  workflowCreateQualityCheck,
  workflowFillQualityCheck,
} from "@/tests/workflows/quality-control";

const { id: productionOrderId, partId } = qualityControlProductionOrder;
const { features } = getMockQualityControl(productionOrderId);
const [firstFeature] = features;
const CHECKED_FEATURE_DELETE_MESSAGE = "La Característica tiene Controles de calidad y no se puede eliminar";

test("a machine that loses its active production order to an administrator picks the next one clean", async ({
  page,
  openPage,
}) => {
  const adminPage = await openPage(UserMode.Admin);
  const { buttonCreate, table } = getQualityControlLocators(page);
  const dialogQueue = page.getByTestId("dialog-content-machine-production-order-queue");
  await workflowOpenProduction(page, qualityControlMachine);
  await workflowFillQualityCheck(page, 7);

  await gotoProductionOrdersWithStatuses(adminPage, [
    ProductionOrderStatus.Pending,
    ProductionOrderStatus.InProduction,
  ]);
  await workflowDeleteProductionOrder(adminPage, productionOrderId);

  await expect(table).toHaveCount(0);
  await expect(dialogQueue).toBeVisible();
  await getTableRowByTestId(
    dialogQueue.getByTestId("table-machine-production-order-queue"),
    queuedProductionOrderWithoutFeatures.id,
  )
    .getByTestId("button-start-production-order")
    .click();
  await expectSingleToast(page);
  await expect(table.getByTestId("tr-no-data")).toBeVisible();
  await expect(buttonCreate).toBeDisabled();
  expect((await getMachineById(qualityControlMachine.id))?.activeProductionOrderId).toBe(
    queuedProductionOrderWithoutFeatures.id,
  );

  // Restoring the order does not queue it again, so the machine keeps working on the other one
  await workflowRestoreProductionOrder(adminPage, productionOrderId);
  expect((await getMachineProductionOrderQueue(qualityControlMachine.id)).map((po) => po.id)).toEqual([
    queuedProductionOrderWithoutFeatures.id,
  ]);
  await expect(table.getByTestId("tr-no-data")).toBeVisible();
  await expect(buttonCreate).toBeDisabled();
});

test("what a machine has filled in survives an administrator editing its active production order", async ({
  page,
  openPage,
}) => {
  const adminPage = await openPage(UserMode.Admin);
  const { buttonConfirm, inputQuantity } = getQualityControlLocators(page);
  const newNotes = "Notas editadas por el administrador";
  await workflowOpenProduction(page, qualityControlMachine);
  await workflowFillQualityCheck(page, 7);

  await adminPage.goto(`/production-order/${productionOrderId}`);
  const inputNotes = getFormInputByLabel(adminPage, "Notas", InputElementType.Textarea);
  await inputNotes.fill(newNotes);
  await adminPage.getByTestId("button-submit").click();
  await expectSingleToast(adminPage);
  expect((await getProductionOrderById(productionOrderId))?.notes).toBe(newNotes);

  await expect(
    getFormInputByLabel(page.getByTestId("form-machine-production-order"), "Notas", InputElementType.Textarea),
  ).toHaveValue(newNotes);
  await expect(inputQuantity).toHaveValue("7");

  await buttonConfirm.click();
  await expectSingleToast(page);
  const { checks } = await getDbQualityControl(productionOrderId);
  expect(checks.slice(-features.length).map(({ ok, partFeatureId }) => ({ ok, partFeatureId }))).toEqual(
    features.map((feature) => ({ ok: true, partFeatureId: feature.id })),
  );
});

test("a machine and an administrator see the checks another machine registers as they happen", async ({
  page,
  openPage,
}) => {
  const adminPage = await openPage(UserMode.Admin);
  const machinePage = await openPage(UserMode.Admin);
  await workflowRunProductionOrderOnMachines(machinePage, productionOrderId, [otherMachine]);
  await workflowOpenProduction(page, qualityControlMachine);
  await gotoQualityControl(adminPage, productionOrderId);
  await assertQualityControlTable(adminPage, getMockQualityControl(productionOrderId), { editable: false });

  await workflowCreateQualityCheck(machinePage, 11);
  const afterRemoteIssue = await getDbQualityControl(productionOrderId);
  await assertQualityControlTable(page, afterRemoteIssue, { editable: true });
  await assertQualityControlTable(adminPage, afterRemoteIssue, { editable: false });

  await workflowCreateQualityCheck(page, 3);
  const afterBothChecks = await getDbQualityControl(productionOrderId);
  const newBatches = groupChecksByDate(
    afterBothChecks.checks.slice(getMockQualityControl(productionOrderId).checks.length),
  );
  expect(newBatches.map(({ producedQuantity }) => producedQuantity)).toEqual([11, 3]);
  expect(newBatches.map(({ results }) => [...results.values()].map(({ ok }) => ok))).toEqual([
    features.map(() => true),
    features.map(() => true),
  ]);
  for (const anyPage of [page, machinePage, adminPage]) {
    await assertQualityControlTable(anyPage, afterBothChecks, { editable: anyPage !== adminPage });
  }
});

test("two machines registering a check of the same production order at the same time keep both", async ({
  page,
  openPage,
}) => {
  const machinePage = await openPage(UserMode.Admin);
  await workflowRunProductionOrderOnMachines(machinePage, productionOrderId, [otherMachine]);
  await workflowOpenProduction(page, qualityControlMachine);
  const checksBefore = getMockQualityControl(productionOrderId).checks;

  await Promise.all([workflowCreateQualityCheck(page, 3), workflowCreateQualityCheck(machinePage, 11)]);

  const afterChecks = await getDbQualityControl(productionOrderId);
  const newBatches = groupChecksByDate(afterChecks.checks.slice(checksBefore.length));
  expect(newBatches.map(({ producedQuantity }) => producedQuantity).sort((a, b) => a - b)).toEqual([3, 11]);
  for (const batch of newBatches) {
    expect([...batch.results.keys()].sort((a, b) => a - b)).toEqual(features.map((feature) => feature.id));
  }
  for (const anyPage of [page, machinePage]) {
    await assertQualityControlTable(anyPage, afterChecks, { editable: true });
  }
});

test("a machine keeps its table and its open dialog when another machine stops the same production order", async ({
  page,
  openPage,
}) => {
  const machinePage = await openPage(UserMode.Admin);
  const { buttonConfirm, inputQuantity } = getQualityControlLocators(page);
  await workflowRunProductionOrderOnMachines(machinePage, productionOrderId, [otherMachine]);
  await workflowOpenProduction(page, qualityControlMachine);
  await workflowFillQualityCheck(page, 4);

  await workflowStopActiveProductionOrder(machinePage, {
    expectedStatus: ProductionOrderStatus.InProduction,
    machine: otherMachine,
    producedQuantity: 0,
  });

  expect((await getMachineById(qualityControlMachine.id))?.activeProductionOrderId).toBe(productionOrderId);
  // The open dialog hides the table from the accessibility tree, so it is checked once the check is saved
  await expect(inputQuantity).toHaveValue("4");
  await buttonConfirm.click();
  await expectSingleToast(page);
  await assertQualityControlTable(page, await getDbQualityControl(productionOrderId), { editable: true });
});

test("a machine follows the features an administrator adds and removes while it checks", async ({ page, openPage }) => {
  const adminPage = await openPage(UserMode.Admin);
  await workflowOpenProduction(page, qualityControlMachine);

  const createdFeature = await workflowCreatePartFeature(adminPage, partId, "Característica remota");
  await assertQualityControlTable(page, await getDbQualityControl(productionOrderId), { editable: true });

  await workflowDeletePartFeature(adminPage, partId, createdFeature.id);
  await assertQualityControlTable(page, await getDbQualityControl(productionOrderId), { editable: true });

  await workflowCreateQualityCheck(page, 5);
  const { checks } = await getDbQualityControl(productionOrderId);
  expect(checks.slice(getMockQualityControl(productionOrderId).checks.length)).toEqual(
    features.map((feature) =>
      expect.objectContaining({ ok: true, partFeatureId: feature.id, producedQuantity: 5, productionOrderId }),
    ),
  );
});

test(
  "an administrator cannot remove a feature that has checks, and the machine keeps seeing it",
  { annotation: TestAnnotations.NonEmptyErrorsLogFile },
  async ({ page, openPage }) => {
    const adminPage = await openPage(UserMode.Admin);
    await workflowOpenProduction(page, qualityControlMachine);

    await workflowDeletePartFeature(adminPage, partId, firstFeature.id, CHECKED_FEATURE_DELETE_MESSAGE);

    await assertQualityControlTable(page, getMockQualityControl(productionOrderId), { editable: true });
    await workflowCreateQualityCheck(page, 5);
  },
);

test("a machine open in two places follows the production orders started from the other one", async ({
  page,
  openPage,
}) => {
  const otherPlace = await openPage(UserMode.Machine);
  const { buttonCreate, table } = getQualityControlLocators(page);
  await workflowOpenProduction(page, qualityControlMachine);

  await workflowStopActiveProductionOrder(otherPlace, {
    expectedStatus: ProductionOrderStatus.Pending,
    machine: qualityControlMachine,
    producedQuantity: 0,
  });
  await expect(table).toHaveCount(0);
  await expect(page.getByTestId("dialog-content-machine-production-order-queue")).toBeVisible();

  await workflowStartProductionOrderFromQueue(
    otherPlace,
    qualityControlMachine,
    queuedProductionOrderWithoutFeatures.id,
  );
  await expect(page.getByTestId("dialog-content-machine-production-order-queue")).toBeHidden();
  await expect(table.getByTestId("tr-no-data")).toBeVisible();
  await expect(buttonCreate).toBeDisabled();

  await workflowStopActiveProductionOrder(otherPlace, {
    expectedStatus: ProductionOrderStatus.Pending,
    machine: qualityControlMachine,
    producedQuantity: 0,
  });
  await workflowStartProductionOrderFromQueue(otherPlace, qualityControlMachine, productionOrderId);
  await assertQualityControlTable(page, getMockQualityControl(productionOrderId), { editable: true });
});
