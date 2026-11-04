import { expect } from "@playwright/test";
import type { Locator } from "@playwright/test";
import { eq, gt } from "drizzle-orm";

import { AppContextStorage, UserMode } from "@/contexts/app-context";
import { getMachineById } from "@/db/functions/machine";
import { getMachineProductionOrderQueue } from "@/db/functions/machine-production-order-queue";
import { getPartById } from "@/db/functions/part";
import {
  getProductionOrderAssignedMachines,
  getProductionOrderById,
  getProductionOrders,
  dbGetProductionOrderStatus,
} from "@/db/functions/production-order";
import {
  dbTableMachine,
  dbTablePart,
  dbTableProductionOrder,
  dbTableSellOrder,
  dbTableSellOrderLine,
} from "@/db/schema";
import { formatPartDimension } from "@/lib/formatters";
import { translatedEnums } from "@/lib/translations";
import { ProductionOrderStatus } from "@/schemas/production-order";
import type { TProductionOrderFilters, TTableProductionOrderState } from "@/schemas/production-order";
import {
  mockBlueprints,
  mockMachineProductionOrderQueues,
  mockMachines,
  mockMaterials,
  mockPartMaterials,
  mockPartReferences,
  mockParts,
  mockProductionOrders,
  mockRawMaterials,
  mockSellOrderLines,
  mockShapes,
} from "@/tests/mock-data";
import { openAndConfirmAlertDialog } from "@/tests/utils/components/alert-dialog";
import {
  assertComboboxOptionsCount,
  assertComboboxValue,
  clickInComboboxOption,
  getClearComboboxButton,
  openCombobox,
  selectComboboxOption,
} from "@/tests/utils/components/combobox";
import { InputElementType, assertFormLoaded, getFormInputByLabel } from "@/tests/utils/components/form";
import { openPartPicker } from "@/tests/utils/components/picker";
import {
  assertTableRowCount,
  getTableNoDataRow,
  getTableRowByTestId,
  getTableRows,
} from "@/tests/utils/components/table";
import { clearToasts, getToastType } from "@/tests/utils/components/toast";
import { TestAnnotations, inAnotherTab, setUserMode, test } from "@/tests/utils/fixtures";
import {
  getMockStartedProductionOrdersWithoutQuantity,
  getMockSellOrderById,
  getMockSellOrderLineById,
  getMockUnstartedProductionOrdersWithoutQuantity,
  getProductionOrdersByStatuses,
} from "@/tests/utils/mock-data-utils";
import { holdRequestWhile } from "@/tests/utils/trpc";
import {
  getQueuedProductionOrderIds,
  gotoProductionOrdersWithStatuses,
  workflowAssignMachineToProductionOrder,
  workflowCreateProductionOrder,
  workflowRestoreProductionOrder,
  workflowDeleteProductionOrder,
  workflowRunProductionOrderOnMachines,
  workflowStopActiveProductionOrder,
} from "@/tests/workflows/production";
import { ToastType } from "@/types";
import type { BaseMachine } from "@/types/machine";
import type { BasePart } from "@/types/part";
import type { BaseProductionOrder } from "@/types/production-order";
import type { BaseSellOrderLine } from "@/types/sell-order-line";

let tableProductionOrders: Locator;

test.beforeEach(({ page }) => {
  tableProductionOrders = page.getByTestId("table-production-order");
});

test("assign, unassign and filter the machines of the production orders", async ({ page, toasts }) => {
  await test.step("filter production orders by machine", async () => {
    const machineWithActiveProductionOrder = mockMachines.find((machine) => machine.activeProductionOrderId !== null)!;
    const machineWithoutProductionOrders = mockMachines.find(
      (machine) => !mockMachineProductionOrderQueues.some((queue) => queue.machineId === machine.id),
    )!;
    // The filter matches every Orden de producción in the queue of the Máquina, not only the active one
    const machineProductionOrders = await getProductionOrdersByStatuses(
      [ProductionOrderStatus.Pending, ProductionOrderStatus.InProduction],
      { filters: [{ id: "assignedMachineId", value: machineWithActiveProductionOrder.id }] },
    );

    await page.goto("/production-order");
    await expect(getTableRows(tableProductionOrders).first()).toBeVisible();

    const comboboxMachineFilter = tableProductionOrders.getByTestId("combobox-filter-machine");
    await openCombobox(comboboxMachineFilter);
    await clickInComboboxOption(page, machineWithActiveProductionOrder.name);

    await assertTableRowCount(tableProductionOrders, machineProductionOrders.length);
    for (const productionOrder of machineProductionOrders) {
      await expect(getTableRowByTestId(tableProductionOrders, productionOrder.id)).toBeVisible();
    }
    await expect(
      getTableRowByTestId(tableProductionOrders, machineWithActiveProductionOrder.activeProductionOrderId!),
    ).toBeVisible();

    await openCombobox(comboboxMachineFilter);
    await clickInComboboxOption(page, machineWithoutProductionOrders.name);
    await expect(getTableNoDataRow(tableProductionOrders)).toBeVisible();

    await getClearComboboxButton(comboboxMachineFilter).click();
    await expect(getTableNoDataRow(tableProductionOrders)).not.toBeVisible();
    await expect(page).toHaveURL("/production-order");
  });

  await test.step("assign a pending production order to a machine", async () => {
    await setUserMode(page, UserMode.User);
    const pendingUnassignedProductionOrders = await getProductionOrdersByStatuses([ProductionOrderStatus.Pending]);
    expect(pendingUnassignedProductionOrders.length).toBeGreaterThan(0);

    await page.goto("/production-order");

    await expect(tableProductionOrders).toBeVisible();

    for (const productionOrder of pendingUnassignedProductionOrders) {
      const tableRow = getTableRowByTestId(tableProductionOrders, productionOrder.id);
      await expect(tableRow).toBeVisible();
    }

    const productionOrderToAssign = pendingUnassignedProductionOrders[0];

    const tableRowToAssign = getTableRowByTestId(tableProductionOrders, productionOrderToAssign.id);
    await expect(tableRowToAssign).toBeVisible();

    const previouslyAssignedMachines = await getProductionOrderAssignedMachines(productionOrderToAssign.id);
    for (const machine of previouslyAssignedMachines) {
      await expect(tableRowToAssign.getByTestId(`div-assigned-machine-${machine.id}`)).toBeVisible();
    }
    const assignedMachine = mockMachines.find((m) => !previouslyAssignedMachines.some((pm) => pm.id === m.id));
    expect(assignedMachine).toBeDefined();

    const previousMachineProductionOrderQueue = await getMachineProductionOrderQueue(assignedMachine!.id);
    expect(previousMachineProductionOrderQueue.some((po) => po.id === productionOrderToAssign.id)).toBe(false);

    await selectComboboxOption(page, tableRowToAssign.getByTestId("combobox-assign-machine"), assignedMachine!.name);

    await expect(toasts).toHaveCount(1);
    expect(await getToastType(toasts.first())).toBe(ToastType.Success);
    await clearToasts(page);

    const updatedAssignedMachines = await getProductionOrderAssignedMachines(productionOrderToAssign.id);
    expect(updatedAssignedMachines.length).toBe(previouslyAssignedMachines.length + 1);
    expect(updatedAssignedMachines.some((m) => m.id === assignedMachine!.id)).toBe(true);

    const updatedMachineProductionOrderQueue = await getMachineProductionOrderQueue(assignedMachine!.id);
    expect(updatedMachineProductionOrderQueue.length).toBe(previousMachineProductionOrderQueue.length + 1);
    expect(updatedMachineProductionOrderQueue.some((po) => po.id === productionOrderToAssign.id)).toBe(true);
  });

  await test.step("unassign a machine from a production order", async () => {
    let selectedMachine: BaseMachine | undefined;
    let selectedMachineProductionOrders: Array<BaseProductionOrder> = [];

    for (const machine of mockMachines) {
      const productionOrdersWithAssignedMachines = await getMachineProductionOrderQueue(machine.id);
      if (!productionOrdersWithAssignedMachines.some((po) => po.id !== machine.activeProductionOrderId)) {
        continue;
      }
      selectedMachine = machine;
      selectedMachineProductionOrders = productionOrdersWithAssignedMachines;
      break;
    }

    expect(selectedMachine).toBeDefined();

    const productionOrderToUnassign = selectedMachineProductionOrders.find(
      (po) => po.id !== selectedMachine!.activeProductionOrderId,
    );
    expect(productionOrderToUnassign).toBeDefined();

    expect(
      [ProductionOrderStatus.Pending, ProductionOrderStatus.InProduction].includes(
        await dbGetProductionOrderStatus(productionOrderToUnassign!),
      ),
    ).toBe(true);

    await page.goto("/production-order");
    await expect(tableProductionOrders).toBeVisible();

    const tableRowToUnassign = getTableRowByTestId(tableProductionOrders, productionOrderToUnassign!.id);
    await expect(tableRowToUnassign).toBeVisible();

    const divAssignedMachine = tableRowToUnassign.getByTestId(`div-assigned-machine-${selectedMachine!.id}`);
    await expect(divAssignedMachine).toBeVisible();

    const buttonUnassignMachine = divAssignedMachine.getByTestId("button-unassign-machine");
    await expect(buttonUnassignMachine).toBeVisible();
    await buttonUnassignMachine.click();

    await expect(toasts).toHaveCount(1);
    expect(await getToastType(toasts.first())).toBe(ToastType.Success);
    await clearToasts(page);

    const updatedAssignedMachines = await getProductionOrderAssignedMachines(productionOrderToUnassign!.id);
    expect(updatedAssignedMachines.some((m) => m.id === selectedMachine!.id)).toBe(false);

    const updatedMachineProductionOrderQueue = await getMachineProductionOrderQueue(selectedMachine!.id);
    expect(updatedMachineProductionOrderQueue.some((po) => po.id === productionOrderToUnassign!.id)).toBe(false);

    await expect(divAssignedMachine).toBeHidden();

    expect(await dbGetProductionOrderStatus(productionOrderToUnassign!)).toBe(ProductionOrderStatus.Pending);
  });

  await test.step("the production order a machine is working on cannot be unassigned", async () => {
    await setUserMode(page, UserMode.Admin);
    const machine = mockMachines.find((mockMachine) => mockMachine.activeProductionOrderId !== null)!;
    const activeProductionOrderId = machine.activeProductionOrderId!;

    await page.goto("/production-order");
    const rowProductionOrder = getTableRowByTestId(tableProductionOrders, activeProductionOrderId);
    const divAssignedMachine = rowProductionOrder.getByTestId(`div-assigned-machine-${machine.id}`);
    await expect(divAssignedMachine).toBeVisible();
    await expect(divAssignedMachine.getByTestId("button-unassign-machine")).toHaveCount(0);
  });
});

test("sort production orders by the numeric dimension of their part", async ({ page, db }) => {
  const statuses = [ProductionOrderStatus.Pending, ProductionOrderStatus.InProduction];
  const filters: TTableProductionOrderState["filters"] = [{ id: "statuses", value: statuses }];
  const productionOrders = await getProductionOrdersByStatuses(statuses);
  const partIds = [...new Set(productionOrders.map((productionOrder) => productionOrder.partId))];
  expect(partIds.length, "The listed Órdenes de producción should belong to several Artículos").toBeGreaterThan(1);

  // As text they sort "10" < "100" < "9", so the narrowest Artículo would be listed last
  for (const [index, partId] of partIds.entries()) {
    const width = index === 0 ? "9" : String(10 ** index);
    await db.update(dbTablePart).set({ width }).where(eq(dbTablePart.id, partId));
  }
  const parts = await Promise.all(partIds.map(async (partId) => (await getPartById(partId))!));
  const getDimension = (productionOrder: BaseProductionOrder) =>
    formatPartDimension(parts.find((part) => part.id === productionOrder.partId));
  const ascendingDimensions = productionOrders
    .map(getDimension)
    .sort((a, b) => Number.parseFloat(a) - Number.parseFloat(b));

  for (const desc of [false, true]) {
    const expectedDimensions = desc ? [...ascendingDimensions].reverse() : ascendingDimensions;
    const sorts = [{ desc, id: "dimension" }];

    expect((await getProductionOrdersByStatuses(statuses, { sorts })).map(getDimension)).toEqual(expectedDimensions);

    const state: TTableProductionOrderState = { filters, pagination: { pageSize: productionOrders.length }, sorts };
    await page.goto(`/production-order?${new URLSearchParams({ "table-production-order": JSON.stringify(state) })}`);
    await expect(getTableRows(tableProductionOrders).getByTestId("dimension")).toHaveText(expectedDimensions);
  }
});

test("clear the default status filter of the production orders", async ({ page }) => {
  const defaultProductionOrders = await getProductionOrdersByStatuses([
    ProductionOrderStatus.Pending,
    ProductionOrderStatus.InProduction,
  ]);
  const allProductionOrders = await getProductionOrders();
  expect(allProductionOrders.length, "Some Órdenes de producción should be hidden by default").toBeGreaterThan(
    defaultProductionOrders.length,
  );

  await page.goto("/production-order");
  await assertTableRowCount(tableProductionOrders, defaultProductionOrders.length);

  await tableProductionOrders.getByTestId("button-clear-filter-statuses").click();
  await assertTableRowCount(tableProductionOrders, allProductionOrders.length);
  await expect(tableProductionOrders.getByTestId("button-clear-filter-statuses")).not.toBeVisible();

  await page.reload();
  await assertTableRowCount(tableProductionOrders, allProductionOrders.length);

  // Setting and clearing another filter must not bring the default status filter back
  const machine = mockMachines.find((mockMachine) => mockMachine.activeProductionOrderId !== null)!;
  const comboboxMachineFilter = tableProductionOrders.getByTestId("combobox-filter-machine");
  await openCombobox(comboboxMachineFilter);
  await clickInComboboxOption(page, machine.name);
  await assertTableRowCount(
    tableProductionOrders,
    (await getProductionOrders({ filters: [{ id: "assignedMachineId", value: machine.id }] })).length,
  );
  await getClearComboboxButton(comboboxMachineFilter).click();
  await assertTableRowCount(tableProductionOrders, allProductionOrders.length);
});

test("filter production orders by unchecking and checking statuses", async ({ page }) => {
  const defaultStatuses = [ProductionOrderStatus.Pending, ProductionOrderStatus.InProduction];
  const countByStatuses = async (statuses: Array<ProductionOrderStatus>) =>
    (await getProductionOrdersByStatuses(statuses)).length;
  const allProductionOrdersCount = (await getProductionOrders()).length;
  let nonDefaultStatus: ProductionOrderStatus | undefined;
  for (const status of Object.values(ProductionOrderStatus)) {
    if (!defaultStatuses.includes(status) && (await countByStatuses([status])) > 0) {
      nonDefaultStatus = status;
      break;
    }
  }
  expect(nonDefaultStatus, "Some Orden de producción should have a status hidden by default").toBeDefined();

  const popupStatusFilter = tableProductionOrders.getByTestId("popup-enum-filter-statuses");
  const buttonClearStatuses = popupStatusFilter.getByTestId("button-clear-filter-statuses");
  const getCheckboxStatus = (status: ProductionOrderStatus) => page.getByTestId(`checkbox-filter-statuses-${status}`);
  const toggleStatus = async (status: ProductionOrderStatus) => {
    if (!(await getCheckboxStatus(status).isVisible())) {
      await popupStatusFilter.getByTestId("popover-trigger").click();
    }
    await getCheckboxStatus(status).click();
  };

  await page.goto("/production-order");
  await assertTableRowCount(tableProductionOrders, await countByStatuses(defaultStatuses));
  await popupStatusFilter.getByTestId("popover-trigger").click();
  for (const status of Object.values(ProductionOrderStatus)) {
    if (defaultStatuses.includes(status)) {
      await expect(getCheckboxStatus(status)).toBeChecked();
    } else {
      await expect(getCheckboxStatus(status)).not.toBeChecked();
    }
  }

  await toggleStatus(ProductionOrderStatus.InProduction);
  await assertTableRowCount(tableProductionOrders, await countByStatuses([ProductionOrderStatus.Pending]));
  await expect(buttonClearStatuses).toBeVisible();

  // Unchecking every status shows every Orden de producción, like clearing the filter
  await toggleStatus(ProductionOrderStatus.Pending);
  await assertTableRowCount(tableProductionOrders, allProductionOrdersCount);
  await expect(buttonClearStatuses).not.toBeVisible();

  // The empty filter is kept, so the default statuses do not come back
  await page.reload();
  await assertTableRowCount(tableProductionOrders, allProductionOrdersCount);
  await popupStatusFilter.getByTestId("popover-trigger").click();
  for (const status of Object.values(ProductionOrderStatus)) {
    await expect(getCheckboxStatus(status)).not.toBeChecked();
  }

  await toggleStatus(nonDefaultStatus!);
  await assertTableRowCount(tableProductionOrders, await countByStatuses([nonDefaultStatus!]));
  await expect(buttonClearStatuses).toBeVisible();

  await page.reload();
  await assertTableRowCount(tableProductionOrders, await countByStatuses([nonDefaultStatus!]));
  await popupStatusFilter.getByTestId("popover-trigger").click();
  await expect(getCheckboxStatus(nonDefaultStatus!)).toBeChecked();
  await expect(getCheckboxStatus(ProductionOrderStatus.Pending)).not.toBeChecked();
  await page.keyboard.press("Escape");

  await buttonClearStatuses.click();
  await assertTableRowCount(tableProductionOrders, allProductionOrdersCount);
  await expect(buttonClearStatuses).not.toBeVisible();
});

// It takes the Orden de producción a Máquina is working on, so it cannot share the database with the other test
test("deleting a production order takes it off the machines", async ({ page, browser, baseURL }) => {
  const machine = mockMachines.find(
    (mockMachine) =>
      mockMachine.activeProductionOrderId !== null &&
      mockMachineProductionOrderQueues.filter((queue) => queue.machineId === mockMachine.id).length > 1,
  )!;
  const activeProductionOrderId = machine.activeProductionOrderId!;
  const queuedProductionOrderId = mockMachineProductionOrderQueues.find(
    (queue) => queue.machineId === machine.id && queue.productionOrderId !== activeProductionOrderId,
  )!.productionOrderId;

  await page.goto("/production-order");

  // An Orden de producción that is only queued is taken off the queue
  await workflowDeleteProductionOrder(page, queuedProductionOrderId);
  expect((await getMachineProductionOrderQueue(machine.id)).map((po) => po.id)).toEqual([activeProductionOrderId]);
  expect((await getMachineById(machine.id))?.activeProductionOrderId).toBe(activeProductionOrderId);

  // The one a Máquina is working on is taken off the queue, and the Máquina stops working on it
  await workflowDeleteProductionOrder(page, activeProductionOrderId);
  expect(await getMachineProductionOrderQueue(machine.id)).toHaveLength(0);
  expect((await getMachineById(machine.id))?.activeProductionOrderId).toBeNull();
  expect(await dbGetProductionOrderStatus((await getProductionOrderById(activeProductionOrderId))!)).toBe(
    ProductionOrderStatus.Deleted,
  );

  // So the Máquina is asked to start another Orden de producción
  await using machineContext = await browser.newContext({ baseURL, ignoreHTTPSErrors: true });
  await machineContext.addCookies([AppContextStorage.testCookie(baseURL!, UserMode.Machine, machine.id)]);
  const machinePage = await machineContext.newPage();
  await machinePage.goto("/production");
  await machinePage.waitForSelector("body[data-hydrated]");
  const dialogContentMachineProductionOrderQueue = machinePage.getByTestId(
    "dialog-content-machine-production-order-queue",
  );
  await expect(dialogContentMachineProductionOrderQueue).toBeVisible();
  await expect(
    getTableNoDataRow(dialogContentMachineProductionOrderQueue.getByTestId("table-machine-production-order-queue")),
  ).toBeVisible();

  // A deleted Orden de producción can only be restored
  const sellOrderId = getMockSellOrderLineById(
    mockProductionOrders.find((productionOrder) => productionOrder.id === activeProductionOrderId)!.sellOrderLineId!,
  )!.sellOrderId;
  const deletedState = {
    filters: [
      { id: "statuses", value: [ProductionOrderStatus.Deleted] },
      { id: "sellOrderId", value: sellOrderId },
    ],
  };
  await page.goto(
    `/production-order?${new URLSearchParams({ "table-production-order": JSON.stringify(deletedState) })}`,
  );
  const actionsProductionOrder = getTableRowByTestId(tableProductionOrders, activeProductionOrderId).getByTestId(
    "actions",
  );
  await expect(actionsProductionOrder.getByTestId("button-delete")).not.toBeAttached();

  // Restoring it makes it pending again, but it is not queued again
  await openAndConfirmAlertDialog(
    page,
    actionsProductionOrder.getByTestId("button-restore"),
    "dialog-restore-model-content",
  );
  await expect(getTableRowByTestId(tableProductionOrders, activeProductionOrderId)).not.toBeVisible();
  await page.goto("/production-order");
  expect(await dbGetProductionOrderStatus((await getProductionOrderById(activeProductionOrderId))!)).toBe(
    ProductionOrderStatus.Pending,
  );
  expect(await getMachineProductionOrderQueue(machine.id)).toHaveLength(0);
  await expect(getTableRowByTestId(tableProductionOrders, activeProductionOrderId).getByTestId("status")).toHaveText(
    "Pendiente",
  );
});

test(
  "restoring a production order that another tab restores meanwhile is rejected",
  { annotation: TestAnnotations.NonEmptyErrorsLogFile },
  async ({ page, toasts }) => {
    const productionOrder = (await getProductionOrdersByStatuses([ProductionOrderStatus.Pending])).at(0)!;
    await gotoProductionOrdersWithStatuses(page, [ProductionOrderStatus.Pending]);
    await workflowDeleteProductionOrder(page, productionOrder.id);
    await clearToasts(page);

    await gotoProductionOrdersWithStatuses(page, [ProductionOrderStatus.Deleted]);
    await holdRequestWhile({
      page,
      procedurePath: "productionOrder.restore",
      send: async () =>
        openAndConfirmAlertDialog(
          page,
          getTableRowByTestId(tableProductionOrders, productionOrder.id).getByTestId("button-restore"),
          "dialog-restore-model-content",
        ),
      meanwhile: async () =>
        inAnotherTab(page, async (anotherPage) => workflowRestoreProductionOrder(anotherPage, productionOrder.id)),
    });

    await expect(toasts).toHaveCount(1);
    expect(await getToastType(toasts.first())).toBe(ToastType.Error);
    await expect(toasts.first()).toContainText(
      `Orden de producción con ID ${productionOrder.id} no encontrada o no eliminada`,
    );
    expect((await getProductionOrderById(productionOrder.id))?.deletedAt).toBeNull();
  },
);

test("the heading only counts the production orders once they are loaded", async ({ page }) => {
  // The count of a loading table is only shown for a moment, so every heading is recorded as the page renders it
  await page.addInitScript(() => {
    const headings = new Set<string>();
    (window as Window & { productionOrderHeadings?: Set<string> }).productionOrderHeadings = headings;
    new MutationObserver(() => {
      for (const heading of document.querySelectorAll("h2")) {
        if (heading.textContent.endsWith("Órdenes de producción")) headings.add(heading.textContent);
      }
    }).observe(document, { characterData: true, childList: true, subtree: true });
  });
  await gotoProductionOrdersWithStatuses(page, Object.values(ProductionOrderStatus));

  await expect(page.getByRole("heading", { level: 2, name: /Órdenes de producción$/ })).toHaveText(
    `${mockProductionOrders.length} Órdenes de producción`,
  );
  const headings = await page.evaluate(() => [
    ...(window as Window & { productionOrderHeadings?: Set<string> }).productionOrderHeadings!,
  ]);
  expect(headings).not.toContain("0 Órdenes de producción");
});

test("the assign machine combobox only lists the machines compatible with the part width", async ({ page, db }) => {
  const productionOrder = (await getProductionOrdersByStatuses([ProductionOrderStatus.Pending])).find(
    (pendingProductionOrder) =>
      !mockMachineProductionOrderQueues.some((queue) => queue.productionOrderId === pendingProductionOrder.id),
  )!;
  expect(productionOrder, "A pending Orden de producción without Máquinas should exist").toBeDefined();
  const [machineInRange, machineAboveWidth, machineWithoutRange] = mockMachines;
  const ranges = new Map<number, { maxDiameter: number | null; minDiameter: number | null }>([
    [machineInRange.id, { maxDiameter: 45, minDiameter: 15 }],
    [machineAboveWidth.id, { maxDiameter: null, minDiameter: 40 }],
    [machineWithoutRange.id, { maxDiameter: null, minDiameter: null }],
  ]);
  for (const [machineId, range] of ranges) {
    await db.update(dbTableMachine).set(range).where(eq(dbTableMachine.id, machineId));
  }
  const assignableMachines = mockMachines.filter((machine) => machine.deletedAt === null);

  const setPartWidth = async (width: string | null) =>
    db.update(dbTablePart).set({ width }).where(eq(dbTablePart.id, productionOrder.partId));
  const comboboxAssignMachine = getTableRowByTestId(tableProductionOrders, productionOrder.id).getByTestId(
    "combobox-assign-machine",
  );
  const checkboxCompatibleMachines = page.getByTestId("checkbox-compatible-machines");
  const expectOptions = async (machines: Array<BaseMachine>) => {
    await assertComboboxOptionsCount(page, machines.length);
    for (const machine of machines) {
      await expect(page.getByTestId("combobox-list").getByRole("option", { name: machine.name })).toBeVisible();
    }
  };

  await setPartWidth("30");
  await setUserMode(page, UserMode.Admin);
  await page.goto("/production-order");

  await test.step("only the compatible machines are listed by default", async () => {
    await openCombobox(comboboxAssignMachine);
    await expect(checkboxCompatibleMachines).toBeChecked();
    await expectOptions(assignableMachines.filter((machine) => machine.id !== machineAboveWidth.id));
  });

  await test.step("uncheck and check the compatible machines checkbox", async () => {
    await checkboxCompatibleMachines.click();
    await expect(checkboxCompatibleMachines).not.toBeChecked();
    await expectOptions(assignableMachines);

    await checkboxCompatibleMachines.click();
    await expectOptions(assignableMachines.filter((machine) => machine.id !== machineAboveWidth.id));
    await page.keyboard.press("Escape");
  });

  await test.step("the limits of the range are inclusive and parts without a numeric width keep every machine", async () => {
    const widths: Array<[string | null, boolean]> = [
      ["40.0", true],
      ["39.9", false],
      [null, true],
      ["sin medida", true],
    ];
    for (const [width, isMachineAboveWidthListed] of widths) {
      await setPartWidth(width);
      await openCombobox(comboboxAssignMachine);
      await expectOptions(
        assignableMachines.filter((machine) => isMachineAboveWidthListed || machine.id !== machineAboveWidth.id),
      );
      await page.keyboard.press("Escape");
    }
  });

  await test.step("assign a compatible machine", async () => {
    await setPartWidth("30");
    await openCombobox(comboboxAssignMachine);
    await assertComboboxOptionsCount(page, assignableMachines.length - 1);
    await clickInComboboxOption(page, machineInRange.name);
    await expect(
      getTableRowByTestId(tableProductionOrders, productionOrder.id).getByTestId(
        `div-assigned-machine-${machineInRange.id}`,
      ),
    ).toBeVisible();
    expect((await getMachineProductionOrderQueue(machineInRange.id)).map((po) => po.id)).toContain(productionOrder.id);
  });
});

// The Medida column shows the width and the shape of the Artículo, which do not have to match the ones of its
// Materiales, while the Materia prima can only come from its Materiales
test("filter production orders by the dimension and the raw material of their part", async ({ page, db }) => {
  const getPart = (partId: number) => mockParts.find((part) => part.id === partId)!;
  const getMaterial = (materialId: number) => mockMaterials.find((material) => material.id === materialId)!;
  const getShape = (shapeId: number | null) => mockShapes.find((shape) => shape.id === shapeId)!;
  const hasRawMaterial = (part: (typeof mockParts)[number], rawMaterialId: number) =>
    mockPartMaterials.some(
      (partMaterial) =>
        partMaterial.partId === part.id && getMaterial(partMaterial.materialId).rawMaterialId === rawMaterialId,
    );
  // Computed from the Artículos instead of with the filter under test
  const getProductionOrderIds = (matchesPart: (part: (typeof mockParts)[number]) => boolean) =>
    mockProductionOrders
      .filter((productionOrder) => matchesPart(getPart(productionOrder.partId)))
      .map((productionOrder) => productionOrder.id);
  const setPartWidth = async (partId: number, width: string | null) =>
    db.update(dbTablePart).set({ width }).where(eq(dbTablePart.id, partId));
  const expectVisibleProductionOrders = async (filters: TProductionOrderFilters, productionOrderIds: Array<number>) => {
    expect(
      (await getProductionOrders({ filters })).map((productionOrder) => productionOrder.id),
      "The server should agree with the table",
    ).toEqual(productionOrderIds);
    if (productionOrderIds.length === 0) {
      await expect(getTableNoDataRow(tableProductionOrders)).toBeVisible();
    }
    await expect(getTableRows(tableProductionOrders)).toHaveCount(productionOrderIds.length);
    // The count is queried apart from the rows, so it could count an Orden de producción twice on its own
    await assertTableRowCount(tableProductionOrders, productionOrderIds.length);
    for (const productionOrderId of productionOrderIds) {
      await expect(getTableRowByTestId(tableProductionOrders, productionOrderId)).toBeVisible();
    }
  };

  const popoverMaterialFilters = tableProductionOrders.getByTestId("popover-part-material-filters");
  const buttonClearMaterialFilters = popoverMaterialFilters.getByTestId("button-clear-filters");
  const inputWidth = page.getByTestId("input-filter-material-width");
  const comboboxRawMaterial = page.getByTestId("combobox-filter-material-raw-material");
  const comboboxShape = page.getByTestId("combobox-filter-material-shape");
  // Every status is listed, so the statuses filter being kept when the material filters are cleared shows them all
  const expectAllProductionOrders = async () => {
    await assertTableRowCount(tableProductionOrders, mockProductionOrders.length);
    await expect(buttonClearMaterialFilters).not.toBeVisible();
  };
  const clearMaterialFilters = async () => {
    await page.keyboard.press("Escape");
    await buttonClearMaterialFilters.click();
    await expectAllProductionOrders();
  };

  await gotoProductionOrdersWithStatuses(page, Object.values(ProductionOrderStatus));
  await expectAllProductionOrders();

  await test.step("filter by the numeric value of the width of the part", async () => {
    // The width is free text, so it may be saved with any scale, with more decimals or without a number
    const partWidths: Array<[number, string]> = [
      [2, "29.0"],
      [3, "29"],
      [6, "29.5"],
      [1, "sin medida"],
    ];
    for (const [partId, width] of partWidths) {
      await setPartWidth(partId, width);
    }
    const getProductionOrderIdsOfParts = (partIds: Array<number>) =>
      mockProductionOrders
        .filter((productionOrder) => partIds.includes(productionOrder.partId))
        .map((productionOrder) => productionOrder.id);

    await popoverMaterialFilters.getByTestId("popover-trigger").click();
    // Typing the decimals goes through "29." first, which must not discard the filter of every status
    expect(
      await getProductionOrdersByStatuses([ProductionOrderStatus.Pending, ProductionOrderStatus.InProduction], {
        filters: [{ id: "partWidth", value: "29" }],
      }),
      "Some of the listed Órdenes de producción should be hidden by the default statuses",
    ).not.toHaveLength(getProductionOrderIdsOfParts([2, 3]).length);
    const typedWidths: Array<[string, string, Array<number>]> = [
      ["29", "29", [2, 3]],
      ["29.0", "29,0", [2, 3]],
      ["29.5", "29,5", [6]],
    ];
    for (const [width, displayedWidth, partIds] of typedWidths) {
      await inputWidth.clear();
      await inputWidth.pressSequentially(width);
      await expect(inputWidth).toHaveValue(displayedWidth);
      await expectVisibleProductionOrders([{ id: "partWidth", value: width }], getProductionOrderIdsOfParts(partIds));
    }

    // Without a width there is nothing to compare, even with 0
    await setPartWidth(1, null);
    await inputWidth.clear();
    const productionOrderIdOfPart = getProductionOrderIdsOfParts([1])[0];
    await expect(
      getTableRowByTestId(tableProductionOrders, productionOrderIdOfPart).getByTestId("dimension"),
    ).not.toContainText("sin medida");
    await inputWidth.pressSequentially("0");
    await expectVisibleProductionOrders([{ id: "partWidth", value: "0" }], []);

    // Emptying the input removes the filter, like the clear button
    await inputWidth.clear();
    await expectAllProductionOrders();
    await page.keyboard.press("Escape");
  });

  await test.step("filter by the shape of the part, not by the ones of its materials", async () => {
    const isShapeOfAMaterial = (shapeId: number) =>
      mockPartMaterials.some((partMaterial) => getMaterial(partMaterial.materialId).shapeId === shapeId);

    const partShape = getShape(getPart(3).shapeId);
    expect(isShapeOfAMaterial(partShape.id), "No Material of an Artículo should have the shape").toBe(false);
    const materialShape = getShape(
      getMaterial(mockPartMaterials.find((partMaterial) => partMaterial.partId === 3)!.materialId).shapeId,
    );
    expect(materialShape.id, "The Material should have another shape than its Artículo").not.toBe(partShape.id);

    await popoverMaterialFilters.getByTestId("popover-trigger").click();
    await openCombobox(comboboxShape);
    await clickInComboboxOption(page, partShape.name);
    await expectVisibleProductionOrders(
      [{ id: "partShapeId", value: partShape.id }],
      getProductionOrderIds((part) => part.shapeId === partShape.id),
    );

    await openCombobox(comboboxShape);
    await clickInComboboxOption(page, materialShape.name);
    await expectVisibleProductionOrders(
      [{ id: "partShapeId", value: materialShape.id }],
      getProductionOrderIds((part) => part.shapeId === materialShape.id),
    );

    await getClearComboboxButton(comboboxShape).click();
    await expectAllProductionOrders();
    await page.keyboard.press("Escape");
  });

  await test.step("filter by the raw material of the materials of the part, combined with its shape", async () => {
    const rawMaterial = mockRawMaterials.find(
      (mockRawMaterial) => mockRawMaterial.id === getMaterial(2).rawMaterialId,
    )!;
    const rawMaterialFilter = { id: "materialRawMaterialId" as const, value: rawMaterial.id };
    const rawMaterialProductionOrderIds = getProductionOrderIds((part) => hasRawMaterial(part, rawMaterial.id));

    // An Artículo with several Materiales of the Materia prima must not duplicate its Órdenes de producción
    const repeatedPartIds = mockPartMaterials
      .filter((partMaterial) => getMaterial(partMaterial.materialId).rawMaterialId === rawMaterial.id)
      .map((partMaterial) => partMaterial.partId)
      .filter((partId, index, partIds) => partIds.indexOf(partId) !== index);
    expect(mockProductionOrders.some((productionOrder) => repeatedPartIds.includes(productionOrder.partId))).toBe(true);
    // An Artículo without Materiales has no Materia prima
    expect(mockParts.some((part) => !mockPartMaterials.some((partMaterial) => partMaterial.partId === part.id))).toBe(
      true,
    );

    await popoverMaterialFilters.getByTestId("popover-trigger").click();
    await openCombobox(comboboxRawMaterial);
    await clickInComboboxOption(page, rawMaterial.name);
    await expectVisibleProductionOrders([rawMaterialFilter], rawMaterialProductionOrderIds);

    const otherShape = getShape(getPart(2).shapeId);
    expect(
      getProductionOrderIds((part) => hasRawMaterial(part, rawMaterial.id) && part.shapeId === otherShape.id),
    ).toHaveLength(0);
    await openCombobox(comboboxShape);
    await clickInComboboxOption(page, otherShape.name);
    await expectVisibleProductionOrders([rawMaterialFilter, { id: "partShapeId", value: otherShape.id }], []);

    const shape = getShape(getPart(1).shapeId);
    const combinedProductionOrderIds = getProductionOrderIds(
      (part) => hasRawMaterial(part, rawMaterial.id) && part.shapeId === shape.id,
    );
    await openCombobox(comboboxShape);
    await clickInComboboxOption(page, shape.name);
    await expectVisibleProductionOrders(
      [rawMaterialFilter, { id: "partShapeId", value: shape.id }],
      combinedProductionOrderIds,
    );

    // The filters are kept in the URL
    await page.reload();
    await expectVisibleProductionOrders(
      [rawMaterialFilter, { id: "partShapeId", value: shape.id }],
      combinedProductionOrderIds,
    );
    await popoverMaterialFilters.getByTestId("popover-trigger").click();
    await assertComboboxValue(comboboxRawMaterial, String(rawMaterial.id));
    await assertComboboxValue(comboboxShape, String(shape.id));
    await expect(inputWidth).toHaveValue("");

    await clearMaterialFilters();
  });

  await test.step("a page holds as many production orders as its size, even when the join repeats them", async () => {
    const state: TTableProductionOrderState = {
      filters: [
        { id: "statuses", value: Object.values(ProductionOrderStatus) },
        { id: "materialRawMaterialId", value: getMaterial(2).rawMaterialId },
      ],
      pagination: { pageSize: 2 },
    };
    const productionOrderIds = getProductionOrderIds((part) => hasRawMaterial(part, getMaterial(2).rawMaterialId));
    expect(productionOrderIds.length, "The Órdenes de producción should fill more than a page").toBeGreaterThan(2);

    await page.goto(`/production-order?${new URLSearchParams({ "table-production-order": JSON.stringify(state) })}`);
    await expect(getTableRows(tableProductionOrders)).toHaveCount(2);
    await assertTableRowCount(tableProductionOrders, productionOrderIds.length);
  });
});

test("show and filter the status of the production orders without a quantity", async ({ page }) => {
  const startedProductionOrders = getMockStartedProductionOrdersWithoutQuantity();
  const unstartedProductionOrders = getMockUnstartedProductionOrdersWithoutQuantity();

  const assertStatuses = async (expectedStatuses: Array<[BaseProductionOrder, ProductionOrderStatus]>) => {
    await setUserMode(page, UserMode.Admin);
    await gotoProductionOrdersWithStatuses(page, Object.values(ProductionOrderStatus));
    for (const [productionOrder, expectedStatus] of expectedStatuses) {
      expect(await dbGetProductionOrderStatus((await getProductionOrderById(productionOrder.id))!)).toBe(
        expectedStatus,
      );
      await expect(getTableRowByTestId(tableProductionOrders, productionOrder.id).getByTestId("status")).toHaveText(
        translatedEnums.ProductionOrderStatus[expectedStatus],
      );
    }

    // The status filter of the table agrees with the status of every row
    for (const status of Object.values(ProductionOrderStatus)) {
      const expectedProductionOrders = await getProductionOrdersByStatuses([status]);
      await gotoProductionOrdersWithStatuses(page, [status]);
      await assertTableRowCount(tableProductionOrders, expectedProductionOrders.length);
      for (const productionOrder of expectedProductionOrders) {
        await expect(getTableRowByTestId(tableProductionOrders, productionOrder.id)).toBeVisible();
      }
    }
  };

  await test.step("without a machine, it is completed once it has produced", async () => {
    await assertStatuses([
      ...startedProductionOrders.map((productionOrder): [BaseProductionOrder, ProductionOrderStatus] => [
        productionOrder,
        ProductionOrderStatus.Completed,
      ]),
      ...unstartedProductionOrders.map((productionOrder): [BaseProductionOrder, ProductionOrderStatus] => [
        productionOrder,
        ProductionOrderStatus.Pending,
      ]),
    ]);
  });

  const idleMachines = mockMachines.filter(
    (machine) => machine.deletedAt === null && machine.activeProductionOrderId === null,
  );
  expect(idleMachines.length, "Wrong test set up: Some Máquinas should be idle").toBeGreaterThan(1);

  for (const productionOrder of unstartedProductionOrders) {
    await test.step(`while a machine runs ${productionOrder.id}, it is in production, even if it has already produced`, async () => {
      await workflowRunProductionOrderOnMachines(page, productionOrder.id, idleMachines);
      for (const machine of idleMachines.slice(0, -1)) {
        await workflowStopActiveProductionOrder(page, {
          expectedStatus: ProductionOrderStatus.InProduction,
          machine,
          producedQuantity: 3,
        });
      }

      await assertStatuses([[productionOrder, ProductionOrderStatus.InProduction]]);
    });

    await test.step(`once the last machine running ${productionOrder.id} stops, it is completed`, async () => {
      await workflowStopActiveProductionOrder(page, {
        expectedStatus: ProductionOrderStatus.Completed,
        machine: idleMachines.at(-1)!,
        producedQuantity: 0,
      });

      await assertStatuses([[productionOrder, ProductionOrderStatus.Completed]]);
    });
  }
});

test(
  "only pending and in production orders can be assigned to a machine",
  { annotation: TestAnnotations.NonEmptyErrorsLogFile },
  async ({ page, db }) => {
    const assignableStatuses = [ProductionOrderStatus.Pending, ProductionOrderStatus.InProduction];
    const statuses = await Promise.all(
      mockProductionOrders.map(async (productionOrder) => dbGetProductionOrderStatus(productionOrder)),
    );
    expect(new Set(statuses), "Every status should be shown").toEqual(new Set(Object.values(ProductionOrderStatus)));

    await gotoProductionOrdersWithStatuses(page, Object.values(ProductionOrderStatus));
    for (const [index, productionOrder] of mockProductionOrders.entries()) {
      const row = getTableRowByTestId(tableProductionOrders, productionOrder.id);
      await expect(row).toBeVisible();
      await expect(row.getByTestId("combobox-assign-machine")).toBeAttached({
        attached: assignableStatuses.includes(statuses[index]),
      });
    }

    // The server rejects them too, when the status changes while the page assigns them
    const productionOrder = (await getProductionOrdersByStatuses([ProductionOrderStatus.Pending])).find(
      (pendingProductionOrder) => pendingProductionOrder.sellOrderLineId !== null,
    )!;
    const { sellOrderId } = getMockSellOrderLineById(productionOrder.sellOrderLineId!)!;
    const activeMachines = mockMachines.filter((mockMachine) => mockMachine.deletedAt === null);
    const queues = await Promise.all(activeMachines.map(async (machine) => getQueuedProductionOrderIds(machine.id)));
    const machine = activeMachines.find((_, index) => !queues[index].includes(productionOrder.id))!;
    const statusChanges: Array<[ProductionOrderStatus, (deletedAt: Date | null) => Promise<void>]> = [
      [
        ProductionOrderStatus.Deleted,
        async (deletedAt) => {
          await db
            .update(dbTableProductionOrder)
            .set({ deletedAt })
            .where(eq(dbTableProductionOrder.id, productionOrder.id));
        },
      ],
      [
        ProductionOrderStatus.SellOrderLineDeleted,
        async (deletedAt) => {
          await db
            .update(dbTableSellOrderLine)
            .set({ deletedAt })
            .where(eq(dbTableSellOrderLine.id, productionOrder.sellOrderLineId!));
        },
      ],
      [
        ProductionOrderStatus.SellOrderDeleted,
        async (deletedAt) => {
          await db.update(dbTableSellOrder).set({ deletedAt }).where(eq(dbTableSellOrder.id, sellOrderId));
        },
      ],
    ];
    for (const [status, setDeletedAt] of statusChanges) {
      await holdRequestWhile({
        page,
        procedurePath: "machineProductionOrderQueue.create",
        send: async () =>
          workflowAssignMachineToProductionOrder(
            page,
            productionOrder.id,
            machine,
            `su estado es "${translatedEnums.ProductionOrderStatus[status]}"`,
          ),
        meanwhile: async () => setDeletedAt(new Date()),
      });
      await setDeletedAt(null);
    }
  },
);

test(
  "create production orders by hand and from a sell order line",
  { annotation: TestAnnotations.NonEmptyErrorsLogFile },
  async ({ page, db, toasts }) => {
    const lastMockProductionOrderId = Math.max(...mockProductionOrders.map((productionOrder) => productionOrder.id));
    const getNewProductionOrders = async () =>
      db
        .select()
        .from(dbTableProductionOrder)
        .where(gt(dbTableProductionOrder.id, lastMockProductionOrderId))
        .orderBy(dbTableProductionOrder.id);
    const getPartIdOfLine = (sellOrderLine: BaseSellOrderLine) =>
      mockPartReferences.find((partReference) => partReference.id === sellOrderLine.partReferenceId)!.partId;
    const isActivePart = (partId: number) => mockParts.find((part) => part.id === partId)!.deletedAt === null;
    const getPartBlueprints = (partId: number) => mockBlueprints.filter((blueprint) => blueprint.partId === partId);
    const deletedPart = mockParts.find((part) => part.deletedAt !== null)!;
    const inputQuantity = getFormInputByLabel(page, "Cantidad a fabricar", InputElementType.Number);
    const assertBlueprintsShown = async (partId: number) => {
      const blueprints = getPartBlueprints(partId);
      expect(blueprints.length, `Part ${partId} needs blueprints`).toBeGreaterThan(0);
      // The blueprints are stacked, so only one is shown at a time
      for (const [index, blueprint] of blueprints.entries()) {
        if (index > 0) await page.getByTestId("button-next-file").click();
        await expect(page.getByTestId(`card-blueprint-${blueprint.id}`)).toBeVisible();
      }
    };

    await test.step("by hand, picking the part, whose blueprints are shown", async () => {
      const part = mockParts.find(
        (mockPart) => mockPart.deletedAt === null && getPartBlueprints(mockPart.id).length > 0,
      )!;
      await page.goto("/create-production-order");
      await assertFormLoaded(page);

      const { dialogPickerPartContent, tablePickerPart } = await openPartPicker(
        page,
        getFormInputByLabel(page, "Artículo", InputElementType.Picker),
      );
      const inputFilterDescription = tablePickerPart.getByTestId("input-filter-description");
      // A deleted part cannot be picked
      await inputFilterDescription.fill(deletedPart.description);
      await expect(getTableNoDataRow(tablePickerPart)).toBeVisible();

      await inputFilterDescription.fill(part.description);
      await getTableRowByTestId(tablePickerPart, part.id).getByTestId("button-success").click();
      await expect(dialogPickerPartContent).not.toBeVisible();
      await assertBlueprintsShown(part.id);
      await inputQuantity.fill("7");
      await page.getByTestId("button-submit").click();

      await expect(page).toHaveURL(/\/production-order\/\d+$/);
      expect(await getToastType(toasts.first())).toBe(ToastType.Success);
      const [newProductionOrder] = await getNewProductionOrders();
      expect(newProductionOrder).toMatchObject({ partId: part.id, quantity: 7, sellOrderLineId: null });
      expect(page.url()).toMatch(new RegExp(`/production-order/${newProductionOrder.id}$`));
      await clearToasts(page);
    });

    await test.step("from a sell order line, with its part, its blueprints and its pending quantity", async () => {
      const sellOrderLine = mockSellOrderLines.find(
        (mockSellOrderLine) =>
          mockSellOrderLine.deletedAt === null &&
          mockSellOrderLine.pendingQuantity > 0 &&
          getMockSellOrderById(mockSellOrderLine.sellOrderId)!.deletedAt === null &&
          !mockProductionOrders.some(
            (productionOrder) =>
              productionOrder.sellOrderLineId === mockSellOrderLine.id && productionOrder.deletedAt === null,
          ) &&
          getPartBlueprints(getPartIdOfLine(mockSellOrderLine)).length > 0,
      )!;
      const buttonCreateProductionOrder = getTableRowByTestId(
        page.getByTestId("table-sell-order-line"),
        sellOrderLine.id,
      ).getByTestId("button-create-production-order");
      await page.goto(`/sell-order/${sellOrderLine.sellOrderId}`);
      await buttonCreateProductionOrder.click();
      await expect(page).toHaveURL(new RegExp(`/create-production-order[?]sellOrderLineId=${sellOrderLine.id}$`));
      await assertFormLoaded(page);
      await expect(inputQuantity).toHaveValue(String(sellOrderLine.pendingQuantity));
      await assertBlueprintsShown(getPartIdOfLine(sellOrderLine));
      await page.getByTestId("button-submit").click();

      await expect(page).toHaveURL(/\/production-order\/\d+$/);
      expect(await getToastType(toasts.first())).toBe(ToastType.Success);
      const newProductionOrders = await getNewProductionOrders();
      expect(newProductionOrders).toHaveLength(2);
      expect(newProductionOrders[1]).toMatchObject({
        partId: getPartIdOfLine(sellOrderLine),
        quantity: sellOrderLine.pendingQuantity,
        sellOrderLineId: sellOrderLine.id,
      });

      // The line has an Orden de producción now, so its pending quantity cannot be produced twice from it
      await page.goto(`/sell-order/${sellOrderLine.sellOrderId}`);
      await expect(getTableRowByTestId(page.getByTestId("table-sell-order-line"), sellOrderLine.id)).toBeVisible();
      await expect(buttonCreateProductionOrder).not.toBeAttached();
    });

    await test.step("the server rejects deleted parts and lines that cannot be produced", async () => {
      // A line of an active part, so it is the line that is rejected and not its part
      const activeLine = mockSellOrderLines.find(
        (mockSellOrderLine) =>
          mockSellOrderLine.deletedAt === null &&
          isActivePart(getPartIdOfLine(mockSellOrderLine)) &&
          getMockSellOrderById(mockSellOrderLine.sellOrderId)!.deletedAt === null,
      )!;
      const otherPartReference = mockPartReferences.find(
        (partReference) => partReference.partId !== getPartIdOfLine(activeLine) && isActivePart(partReference.partId),
      )!;
      const otherPart = mockParts.find((part) => part.id === otherPartReference.partId)!;
      const [customLine] = await db
        .insert(dbTableSellOrderLine)
        .values({
          description: "Línea sin Artículo",
          pendingQuantity: 1,
          quantity: 1,
          sellOrderId: activeLine.sellOrderId,
        })
        .returning();
      const productionOrdersBefore = await getNewProductionOrders();
      const createWhile = async (
        { sellOrderLineId, part }: { sellOrderLineId?: number; part?: BasePart },
        expectedErrorMessage: string,
        meanwhile: () => Promise<void>,
      ) =>
        holdRequestWhile({
          page,
          procedurePath: "productionOrder.create",
          send: async () => workflowCreateProductionOrder(page, { part, sellOrderLineId }, expectedErrorMessage),
          meanwhile,
        });
      const setPartDeletedAt = async (deletedAt: Date | null) => {
        await db.update(dbTablePart).set({ deletedAt }).where(eq(dbTablePart.id, otherPart.id));
      };
      const setActiveLine = async (values: Partial<BaseSellOrderLine>) => {
        await db.update(dbTableSellOrderLine).set(values).where(eq(dbTableSellOrderLine.id, activeLine.id));
      };
      const setSellOrderDeletedAt = async (deletedAt: Date | null) => {
        await db.update(dbTableSellOrder).set({ deletedAt }).where(eq(dbTableSellOrder.id, activeLine.sellOrderId));
      };

      await createWhile({ part: otherPart }, `El Artículo "${otherPart.description}" está eliminado`, async () =>
        setPartDeletedAt(new Date()),
      );
      await setPartDeletedAt(null);

      await createWhile(
        { sellOrderLineId: activeLine.id },
        `La Línea de pedido de venta ${activeLine.id} está eliminada`,
        async () => setActiveLine({ deletedAt: new Date() }),
      );
      await setActiveLine({ deletedAt: null });

      await createWhile(
        { sellOrderLineId: activeLine.id },
        `La Línea de pedido de venta ${activeLine.id} es una devolución`,
        async () => setActiveLine({ pendingQuantity: -5, quantity: -5 }),
      );
      await setActiveLine({ pendingQuantity: activeLine.pendingQuantity, quantity: activeLine.quantity });

      await createWhile(
        { sellOrderLineId: activeLine.id },
        `El Pedido de venta de la Línea ${activeLine.id} está eliminado`,
        async () => setSellOrderDeletedAt(new Date()),
      );
      await setSellOrderDeletedAt(null);

      await createWhile({ sellOrderLineId: activeLine.id }, "no es del Artículo", async () =>
        setActiveLine({ partReferenceId: otherPartReference.id }),
      );
      await setActiveLine({ partReferenceId: activeLine.partReferenceId });

      // Opened by its URL, a line without part leaves the part to pick, but no part is the one of the line
      await workflowCreateProductionOrder(
        page,
        { part: otherPart, sellOrderLineId: customLine.id },
        "no es del Artículo",
      );

      await createWhile(
        { part: otherPart, sellOrderLineId: customLine.id },
        `Línea de pedido de venta ${customLine.id} no encontrada`,
        async () => {
          await db.delete(dbTableSellOrderLine).where(eq(dbTableSellOrderLine.id, customLine.id));
        },
      );

      expect(await getNewProductionOrders()).toEqual(productionOrdersBefore);
    });
  },
);
