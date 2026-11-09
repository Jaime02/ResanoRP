import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { eq } from "drizzle-orm";

import { UserMode } from "@/contexts/app-context";
import type { TDatabase } from "@/db";
import { getQualityChecksOfProductionOrder } from "@/db/functions/quality-check";
import { dbTableProductionOrder } from "@/db/schema";
import { ProductionOrderStatus } from "@/schemas/production-order";
import { mockMachineProductionOrderQueues } from "@/tests/mock-data";
import { expectSingleToast } from "@/tests/utils/components/toast";
import { TestAnnotations, test } from "@/tests/utils/fixtures";
import { holdRequestWhile } from "@/tests/utils/trpc";
import { workflowCreatePartFeature, workflowDeletePartFeature } from "@/tests/workflows/part";
import {
  gotoProductionOrdersWithStatuses,
  workflowDeleteProductionOrder,
  workflowOpenProduction,
  workflowStartProductionOrderFromQueue,
  workflowStopActiveProductionOrder,
} from "@/tests/workflows/production";
import {
  assertQualityControlTable,
  getDbQualityControl,
  getMockProductionOrder,
  getMockQualityControl,
  getQualityControlLocators,
  otherMachine,
  qualityControlMachine,
  qualityControlProductionOrder,
  queuedProductionOrderWithoutFeatures,
  workflowCreateQualityCheck,
  workflowFillQualityCheck,
} from "@/tests/workflows/quality-control";

const { id: productionOrderId, partId } = qualityControlProductionOrder;
const { features } = getMockQualityControl(productionOrderId);
const MISSING_FEATURE_MESSAGE = "El Control de calidad debe revisar cada Característica del Artículo una vez";

test("the quality control table of a machine", async ({ page }) => {
  await test.step("the machine cannot register a check or an issue without quantity", async () => {
    const { buttonConfirm, buttonCreate } = getQualityControlLocators(page);
    await workflowOpenProduction(page, qualityControlMachine);

    await buttonCreate.click();
    await expect(buttonConfirm).toBeDisabled();
    await page.keyboard.press("Escape");
  });

  await test.step("the machine shows the checks of its active production order and registers new ones", async () => {
    const checksBefore = getMockQualityControl(productionOrderId).checks;
    await workflowOpenProduction(page, qualityControlMachine);
    await assertQualityControlTable(page, getMockQualityControl(productionOrderId), { editable: true });

    await workflowCreateQualityCheck(page, 9);
    const afterCheck = await getDbQualityControl(productionOrderId);
    const newChecks = afterCheck.checks.slice(checksBefore.length);
    expect(newChecks).toHaveLength(features.length);
    for (const feature of features) {
      const hasRange = feature.minValue !== null || feature.maxValue !== null;
      expect(newChecks.find(({ partFeatureId }) => partFeatureId === feature.id)).toEqual(
        expect.objectContaining({
          ok: true,
          producedQuantity: 9,
          value: hasRange ? (feature.maxValue ?? feature.minValue) : null,
        }),
      );
    }
    await assertQualityControlTable(page, afterCheck, { editable: true });
  });

  await test.step("a boolean feature can fail and a value outside the range is not ok", async () => {
    const rangedFeature = features.find((feature) => feature.minValue !== null || feature.maxValue !== null)!;
    const booleanFeature = features.find((feature) => feature.minValue === null && feature.maxValue === null)!;
    expect(rangedFeature, "Wrong test set up: Some Característica of the order should have a range").toBeDefined();
    expect(booleanFeature, "Wrong test set up: Some Característica of the order should have no range").toBeDefined();
    const checksBefore = (await getDbQualityControl(productionOrderId)).checks;
    await workflowOpenProduction(page, qualityControlMachine);

    await workflowCreateQualityCheck(page, 2, undefined, {
      failedFeatureIds: [booleanFeature.id],
      values: { [rangedFeature.id]: "99999" },
    });
    const afterValues = await getDbQualityControl(productionOrderId);
    const newChecks = afterValues.checks.slice(checksBefore.length);
    expect(newChecks.find(({ partFeatureId }) => partFeatureId === booleanFeature.id)).toEqual(
      expect.objectContaining({ notes: null, ok: false, value: null }),
    );
    expect(newChecks.find(({ partFeatureId }) => partFeatureId === rangedFeature.id)).toEqual(
      expect.objectContaining({ ok: false, value: "99999" }),
    );
    await assertQualityControlTable(page, afterValues, { editable: true });
  });

  await test.step("a value on the limits of a range is ok and one just outside it is not, whichever limits it has", async () => {
    const rangedFeatures = features.filter((feature) => feature.minValue !== null || feature.maxValue !== null);
    expect(
      rangedFeatures.some(({ minValue, maxValue }) => minValue !== null && maxValue !== null) &&
        rangedFeatures.some(({ minValue, maxValue }) => minValue !== null && maxValue === null) &&
        rangedFeatures.some(({ minValue, maxValue }) => minValue === null && maxValue !== null),
      "Wrong test set up: The Características of the order should have a range with both limits, one with only a minimum and one with only a maximum",
    ).toBe(true);
    await workflowOpenProduction(page, qualityControlMachine);

    for (const { id, minValue, maxValue } of rangedFeatures) {
      const cases: Array<[string, boolean]> = [];
      if (minValue !== null) {
        cases.push([minValue, true], [(Number(minValue) - 0.01).toFixed(2), false]);
      } else {
        cases.push(["-99999", true]);
      }
      if (maxValue !== null) {
        cases.push([maxValue, true], [(Number(maxValue) + 0.01).toFixed(2), false]);
      } else {
        cases.push(["99999", true]);
      }
      for (const [value, ok] of cases) {
        const checksBefore = (await getDbQualityControl(productionOrderId)).checks;
        await workflowCreateQualityCheck(page, 1, undefined, { values: { [id]: value } });
        const saved = (await getDbQualityControl(productionOrderId)).checks
          .slice(checksBefore.length)
          .find(({ partFeatureId }) => partFeatureId === id);
        expect(saved?.ok, `Feature ${id} with value ${value}`).toBe(ok);
        expect(Number(saved?.value), `Feature ${id} with value ${value}`).toBe(Number(value));
      }
    }
    await assertQualityControlTable(page, await getDbQualityControl(productionOrderId), { editable: true });
  });

  await test.step("the notes are saved with their feature and an empty one is not", async () => {
    const rangedFeature = features.find((feature) => feature.minValue !== null || feature.maxValue !== null)!;
    const [firstFeature, secondFeature] = features.filter(({ id }) => id !== rangedFeature.id);
    const checksBefore = (await getDbQualityControl(productionOrderId)).checks;
    await workflowOpenProduction(page, qualityControlMachine);

    await workflowCreateQualityCheck(page, 1, undefined, {
      notes: { [firstFeature.id]: "Rebabas en el extremo", [rangedFeature.id]: "Rayada" },
      values: { [rangedFeature.id]: "99999" },
    });
    const afterNotes = await getDbQualityControl(productionOrderId);
    const newChecks = afterNotes.checks.slice(checksBefore.length);
    expect(newChecks.find(({ partFeatureId }) => partFeatureId === firstFeature.id)?.notes).toBe(
      "Rebabas en el extremo",
    );
    expect(newChecks.find(({ partFeatureId }) => partFeatureId === secondFeature.id)?.notes).toBeNull();
    expect(newChecks.find(({ partFeatureId }) => partFeatureId === rangedFeature.id)).toEqual(
      expect.objectContaining({ notes: "Rayada", ok: false, value: "99999" }),
    );
    await assertQualityControlTable(page, afterNotes, { editable: true });
  });

  await test.step("the dialog starts clean every time it opens", async () => {
    const { buttonCreate, dialogCreate, inputQuantity } = getQualityControlLocators(page);
    const booleanFeature = features.find((feature) => feature.minValue === null && feature.maxValue === null)!;
    const rangedFeature = features.find((feature) => feature.minValue !== null || feature.maxValue !== null)!;
    await workflowOpenProduction(page, qualityControlMachine);

    await workflowFillQualityCheck(page, 6, {
      failedFeatureIds: [booleanFeature.id],
      notes: { [booleanFeature.id]: "Nota" },
      values: { [rangedFeature.id]: "12" },
    });
    await expect(dialogCreate.getByTestId(`checkbox-quality-check-${booleanFeature.id}`)).not.toBeChecked();
    await page.keyboard.press("Escape");

    await buttonCreate.click();
    await expect(inputQuantity).toHaveValue("");
    await expect(dialogCreate.getByTestId(`checkbox-quality-check-${booleanFeature.id}`)).toBeChecked();
    await expect(dialogCreate.getByTestId(`input-quality-check-value-${rangedFeature.id}`)).toHaveValue("");
    await expect(dialogCreate.getByTestId(`input-quality-check-notes-${booleanFeature.id}`)).toHaveValue("");
    await expect(dialogCreate.getByTestId(`checkbox-quality-check-${rangedFeature.id}`)).toHaveCount(0);
    await expect(dialogCreate.getByTestId(`input-quality-check-value-${booleanFeature.id}`)).toHaveCount(0);
    await page.keyboard.press("Escape");
  });

  await test.step("a check can be registered before any part is counted", async () => {
    const checksBefore = (await getDbQualityControl(productionOrderId)).checks;
    await workflowOpenProduction(page, qualityControlMachine);

    await workflowCreateQualityCheck(page, 0);
    const afterCheck = await getDbQualityControl(productionOrderId);
    expect(afterCheck.checks.slice(checksBefore.length).map(({ producedQuantity }) => producedQuantity)).toEqual(
      features.map(() => 0),
    );
    await assertQualityControlTable(page, afterCheck, { editable: true });
  });

  await test.step("the table of the machine follows the production orders it starts", async () => {
    const { buttonCreate, table } = getQualityControlLocators(page);
    const queueWithoutQualityControl = mockMachineProductionOrderQueues.find(
      (queue) => queue.machineId === otherMachine.id && !getMockProductionOrder(queue.productionOrderId).qualityControl,
    )!;
    expect(
      queueWithoutQualityControl,
      "Wrong test set up: Some Máquina should queue an order without it",
    ).toBeDefined();

    await workflowStopActiveProductionOrder(page, {
      expectedStatus: ProductionOrderStatus.Pending,
      machine: qualityControlMachine,
      producedQuantity: 0,
    });
    await expect(table).toHaveCount(0);

    await workflowStartProductionOrderFromQueue(page, qualityControlMachine, queuedProductionOrderWithoutFeatures.id);
    await expect(table.getByTestId("tr-no-data")).toBeVisible();
    await expect(buttonCreate).toBeDisabled();

    await workflowStartProductionOrderFromQueue(page, otherMachine, queueWithoutQualityControl.productionOrderId);
    await expect(page.getByTestId("form-machine-production-order")).toBeVisible();
    await expect(table).toHaveCount(0);
  });
});

const rejectedCheckCases: Array<{
  name: string;
  message: string;
  tableStaysMounted: boolean;
  setUp?: (context: { adminPage: Page }) => Promise<number>;
  change: (context: { adminPage: Page; db: TDatabase; setUpResult?: number }) => Promise<void>;
}> = [
  {
    name: "deleted",
    message: `La Orden de producción ${productionOrderId} está eliminada`,
    tableStaysMounted: false,
    change: async ({ adminPage }) => {
      await gotoProductionOrdersWithStatuses(adminPage, [
        ProductionOrderStatus.Pending,
        ProductionOrderStatus.InProduction,
      ]);
      await workflowDeleteProductionOrder(adminPage, productionOrderId);
    },
  },
  {
    name: "left without quality control",
    message: `La Orden de producción ${productionOrderId} no tiene Control de calidad`,
    tableStaysMounted: false,
    // No screen turns it off once the order is made
    change: async ({ db }) => {
      await db
        .update(dbTableProductionOrder)
        .set({ qualityControl: false })
        .where(eq(dbTableProductionOrder.id, productionOrderId));
    },
  },
  {
    name: "given a new feature",
    message: MISSING_FEATURE_MESSAGE,
    tableStaysMounted: true,
    change: async ({ adminPage }) => {
      await workflowCreatePartFeature(adminPage, partId, "Característica remota");
    },
  },
  {
    name: "left without a feature",
    message: MISSING_FEATURE_MESSAGE,
    tableStaysMounted: true,
    setUp: async ({ adminPage }) => (await workflowCreatePartFeature(adminPage, partId, "Característica temporal")).id,
    change: async ({ adminPage, setUpResult }) => {
      await workflowDeletePartFeature(adminPage, partId, setUpResult!);
    },
  },
];

for (const { name, message, tableStaysMounted, setUp, change } of rejectedCheckCases) {
  test(
    `the machine cannot save a check when its production order is ${name} meanwhile`,
    { annotation: TestAnnotations.NonEmptyErrorsLogFile },
    async ({ page, db, openPage }) => {
      const adminPage = await openPage({ userMode: UserMode.Admin });
      const { buttonConfirm, inputQuantity } = getQualityControlLocators(page);
      await workflowOpenProduction(page, qualityControlMachine);
      const setUpResult = await setUp?.({ adminPage });
      const checksBefore = await getQualityChecksOfProductionOrder(productionOrderId);
      await assertQualityControlTable(page, await getDbQualityControl(productionOrderId), { editable: true });
      await workflowFillQualityCheck(page, 8);

      await holdRequestWhile({
        page,
        procedurePath: "qualityCheck.create",
        send: async () => buttonConfirm.click(),
        meanwhile: async () => change({ adminPage, db, setUpResult }),
      });

      await expectSingleToast(page, message);
      expect(await getQualityChecksOfProductionOrder(productionOrderId)).toEqual(checksBefore);
      if (tableStaysMounted) {
        await expect(inputQuantity).toHaveValue("");
        await expect(buttonConfirm).toBeDisabled();
      }
    },
  );
}
