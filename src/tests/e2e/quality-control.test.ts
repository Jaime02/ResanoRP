import { expect } from "@playwright/test";

import { getProductionOrderById } from "@/db/functions/production-order";
import { getQualityChecksOfProductionOrder } from "@/db/functions/quality-check";
import { DEFAULT_QUALITY_CONTROL_MIN_QUANTITY } from "@/lib/production-order";
import { OPEN_PART_LABEL } from "@/messages/part";
import { QUANTITY_TO_PRODUCE_LABEL } from "@/messages/production-order";
import { mockProductionOrders, mockQualityChecks } from "@/tests/mock-data";
import { InputElementType, assertFormLoaded, getFormInputByLabel } from "@/tests/utils/components/form";
import { getTableRowByTestId } from "@/tests/utils/components/table";
import { TestAnnotations, test } from "@/tests/utils/fixtures";
import { assertPartLink } from "@/tests/workflows/production";
import {
  assertQualityControlTable,
  findOrderWithFeatures,
  getMockChecks,
  getMockFeatures,
  getMockQualityControl,
  getQualityControlCheckbox,
  getQualityControlLocators,
  gotoQualityControl,
  workflowSetQualityControl,
} from "@/tests/workflows/quality-control";

const productionOrderIdsWithChecks = [...new Set(mockQualityChecks.map((check) => check.productionOrderId))];

test("the quality control of the production orders", async ({ page }) => {
  await test.step("show the checks already made of each production order with quality control", async () => {
    expect(
      productionOrderIdsWithChecks.length,
      "Wrong test set up: Some checks should belong to several orders",
    ).toBeGreaterThan(1);
    expect(
      mockQualityChecks.some((check) => !check.ok) && mockQualityChecks.some((check) => check.ok),
      "Wrong test set up: Some checks should fail and some should pass",
    ).toBe(true);

    for (const productionOrderId of productionOrderIdsWithChecks) {
      await gotoQualityControl(page, productionOrderId);
      await assertQualityControlTable(page, getMockQualityControl(productionOrderId), { editable: false });
    }
  });

  await test.step("a production order with quality control and no checks yet shows only its features", async () => {
    const productionOrder = findOrderWithFeatures((id) => getMockChecks(id).length === 0);
    expect(productionOrder, "Wrong test set up: Some order should have quality control and no checks").toBeDefined();

    await gotoQualityControl(page, productionOrder.id);
    await assertQualityControlTable(page, getMockQualityControl(productionOrder.id), { editable: false });
    for (const feature of getMockFeatures(productionOrder.partId)) {
      await expect(getTableRowByTestId(getQualityControlLocators(page).table, feature.id)).toBeVisible();
    }
  });

  await test.step("a production order whose part has no features tells so", async () => {
    const productionOrder = mockProductionOrders.find(
      (po) => po.qualityControl && getMockFeatures(po.partId).length === 0,
    )!;
    expect(productionOrder, "Wrong test set up: Some order should have quality control and no features").toBeDefined();

    const table = await gotoQualityControl(page, productionOrder.id);
    await expect(table.getByTestId("tr-no-data")).toBeVisible();
    await expect(table.getByTestId("button-quality-check-create")).toHaveCount(0);
    await expect(table.getByRole("link", { name: OPEN_PART_LABEL })).toHaveAttribute(
      "href",
      `/part/${productionOrder.partId}?tab=blueprints`,
    );
  });

  await test.step("a production order without quality control does not show the table", async () => {
    const productionOrder = mockProductionOrders.find((po) => !po.qualityControl)!;
    await page.goto(`/production-order/${productionOrder.id}`);
    await expect(page.getByText(`Orden de producción ${productionOrder.id}`).first()).toBeVisible();
    await expect(getQualityControlLocators(page).table).toHaveCount(0);
    await assertPartLink(page, productionOrder.partId);
  });

  await test.step("a deleted production order does not allow changing its quality control", async () => {
    const deletedOrder = mockProductionOrders.find((po) => po.deletedAt !== null)!;
    expect(deletedOrder, "Wrong test set up: Some production order should be deleted").toBeDefined();
    await page.goto(`/production-order/${deletedOrder.id}`);
    await expect(page.getByText(`Orden de producción ${deletedOrder.id}`).first()).toBeVisible();
    await expect(getQualityControlCheckbox(page)).toHaveCount(0);
  });

  await test.step("a production order is created with quality control from the default quantity", async () => {
    await page.goto("/create-production-order");
    const checkbox = getQualityControlCheckbox(page);
    const inputQuantity = getFormInputByLabel(page, QUANTITY_TO_PRODUCE_LABEL, InputElementType.Number);
    await assertFormLoaded(page);
    await expect(checkbox).not.toBeChecked();
    await inputQuantity.fill(String(DEFAULT_QUALITY_CONTROL_MIN_QUANTITY));
    await expect(checkbox).toBeChecked();
    await inputQuantity.fill(String(DEFAULT_QUALITY_CONTROL_MIN_QUANTITY - 1));
    await expect(checkbox).not.toBeChecked();
  });

  await test.step("a failed check shows its notes in a tooltip", async () => {
    const failedCheckWithNotes = mockQualityChecks.find((check) => !check.ok && check.notes !== null)!;
    expect(failedCheckWithNotes, "Wrong test set up: Some failed check should have notes").toBeDefined();

    const table = await gotoQualityControl(page, failedCheckWithNotes.productionOrderId);
    const trigger = getTableRowByTestId(table, failedCheckWithNotes.partFeatureId).getByTestId(
      "tooltip-quality-check-issue",
    );
    // The cell is rendered again when the checks finish syncing, which closes a popover opened before
    await expect(async () => {
      await trigger.hover();
      await expect(page.getByTestId("popover-content")).toHaveText(failedCheckWithNotes.notes!, { timeout: 1000 });
    }).toPass();
  });

  await test.step("the administrator enables and disables the quality control of a production order", async () => {
    const activeOrders = mockProductionOrders.filter((po) => po.deletedAt === null);
    const orderWithoutQualityControl = activeOrders.find(
      (po) => !po.qualityControl && getMockFeatures(po.partId).length > 0,
    )!;
    expect(
      orderWithoutQualityControl,
      "Wrong test set up: Some order should have features and no quality control",
    ).toBeDefined();
    const orderWithChecks = activeOrders.find((po) => po.qualityControl && getMockChecks(po.id).length > 0)!;
    expect(orderWithChecks, "Wrong test set up: Some order should have quality control and checks").toBeDefined();

    await test.step("enabling it shows the features of the part and keeps the rest of the order", async () => {
      await workflowSetQualityControl(page, orderWithoutQualityControl.id, true);
      await assertQualityControlTable(page, getMockQualityControl(orderWithoutQualityControl.id), {
        editable: false,
      });
      expect(await getProductionOrderById(orderWithoutQualityControl.id)).toMatchObject({
        notes: orderWithoutQualityControl.notes,
        qualityControl: true,
        quantity: orderWithoutQualityControl.quantity,
      });
    });

    await test.step("disabling it hides the table but does not delete the checks made", async () => {
      await workflowSetQualityControl(page, orderWithChecks.id, false);
      expect((await getProductionOrderById(orderWithChecks.id))?.qualityControl).toBe(false);
      expect(await getQualityChecksOfProductionOrder(orderWithChecks.id)).toHaveLength(
        getMockChecks(orderWithChecks.id).length,
      );

      await workflowSetQualityControl(page, orderWithChecks.id, true);
      await assertQualityControlTable(page, getMockQualityControl(orderWithChecks.id), { editable: false });
    });
  });
});

test(
  "users only see the quality control of the production orders",
  { annotation: [TestAnnotations.UserModeUser] },
  async ({ page }) => {
    await test.step("users see the checks of the production orders but cannot make new ones", async () => {
      for (const productionOrderId of productionOrderIdsWithChecks) {
        await gotoQualityControl(page, productionOrderId);
        await assertQualityControlTable(page, getMockQualityControl(productionOrderId), { editable: false });
      }
    });

    await test.step("users cannot change the quality control of a production order", async () => {
      for (const qualityControl of [true, false]) {
        const productionOrder = mockProductionOrders.find(
          (po) => po.deletedAt === null && po.qualityControl === qualityControl,
        )!;
        await page.goto(`/production-order/${productionOrder.id}`);
        await expect(page.getByText(`Orden de producción ${productionOrder.id}`).first()).toBeVisible();
        await expect(getQualityControlCheckbox(page)).toHaveCount(0);
        await expect(page.getByTestId("button-submit")).toHaveCount(0);
      }
    });
  },
);
