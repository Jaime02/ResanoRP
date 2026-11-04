import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

import { UserMode } from "@/contexts/app-context";
import { getClientById } from "@/db/functions/client";
import { getMachineById } from "@/db/functions/machine";
import { getMachineProductionOrderQueue } from "@/db/functions/machine-production-order-queue";
import { getPartProductionsOfMachineAndPart } from "@/db/functions/part-production";
import {
  dbGetProductionOrderStatus,
  getProductionOrderById,
  getProductionOrderProducedQuantity,
} from "@/db/functions/production-order";
import { getSellOrderById } from "@/db/functions/sell-order";
import { getSellOrderLineById } from "@/db/functions/sell-order-line";
import { isProductionFinished } from "@/lib/production-order";
import { ProductionOrderStatus } from "@/schemas/production-order";
import type { TTableProductionOrderState } from "@/schemas/production-order";
import { mockProductionOrders } from "@/tests/mock-data";
import { openAndConfirmAlertDialog } from "@/tests/utils/components/alert-dialog";
import { clickInComboboxOption, fillComboboxFilter, openCombobox } from "@/tests/utils/components/combobox";
import { InputElementType, assertFormLoaded, getFormInputByLabel } from "@/tests/utils/components/form";
import { openPartPicker } from "@/tests/utils/components/picker";
import { getTableRowByTestId } from "@/tests/utils/components/table";
import { clearToasts, expectSingleToast, getToastType, getToasts } from "@/tests/utils/components/toast";
import { pickActiveMachine, setUserMode } from "@/tests/utils/fixtures";
import { ToastType } from "@/types";
import type { BaseMachine } from "@/types/machine";
import type { BasePart } from "@/types/part";
import type { BaseProductionOrder } from "@/types/production-order";

export function getProductionLocators(page: Page) {
  const dialogContentStopProductionOrder = page.getByTestId("dialog-content-stop-production-order");
  const dialogContentMachineProductionOrderQueue = page.getByTestId("dialog-content-machine-production-order-queue");
  return {
    dialogContentMachineProductionOrderQueue,
    dialogContentNoTagPrinted: page.getByTestId("dialog-content-no-tag-printed-stop-production-order"),
    dialogContentStopProductionOrder,
    formMachineProductionOrder: page.getByTestId("form-machine-production-order"),
    inputProducedQuantity: getFormInputByLabel(
      dialogContentStopProductionOrder,
      "Unidades fabricadas",
      InputElementType.Number,
    ),
    tableMachineProductionOrderQueue: dialogContentMachineProductionOrderQueue.getByTestId(
      "table-machine-production-order-queue",
    ),
  };
}

export async function getActiveProductionOrder(machine: BaseMachine): Promise<BaseProductionOrder> {
  const dbMachine = await getMachineById(machine.id);
  expect(dbMachine?.activeProductionOrderId).not.toBeNull();
  const dbProductionOrder = await getProductionOrderById(dbMachine!.activeProductionOrderId!);
  expect(dbProductionOrder).toBeDefined();
  return dbProductionOrder!;
}

export async function getProductionOrderClientName(productionOrder: BaseProductionOrder) {
  if (productionOrder.sellOrderLineId === null) return "";
  const sellOrderLine = await getSellOrderLineById(productionOrder.sellOrderLineId);
  const sellOrder = await getSellOrderById(sellOrderLine!.sellOrderId);
  return (await getClientById(sellOrder!.clientId))!.name;
}

export async function getQueuedProductionOrderIds(machineId: number) {
  return (await getMachineProductionOrderQueue(machineId)).map((productionOrder) => productionOrder.id);
}

export async function workflowOpenProduction(page: Page, machine: BaseMachine) {
  await setUserMode(page, UserMode.Machine);
  await page.goto("/production");
  await pickActiveMachine(page, machine);
  await assertFormLoaded(page.getByTestId("container-production"));
}

export async function workflowOpenStopDialog(page: Page) {
  const { dialogContentStopProductionOrder, inputProducedQuantity } = getProductionLocators(page);
  const stopButton = page.getByTestId("button-dialog-trigger-stop-production-order");
  await expect(stopButton).toBeVisible();
  await stopButton.click();
  await expect(dialogContentStopProductionOrder).toBeVisible();
  await expect(inputProducedQuantity).toBeVisible();
}

export async function workflowFillProducedQuantity(page: Page, producedQuantity: number) {
  if (producedQuantity <= 0) {
    throw new Error("Wrong test set up: Produced quantity must be positive");
  }
  const { inputProducedQuantity } = getProductionLocators(page);
  await inputProducedQuantity.fill(String(producedQuantity));
  await expect(inputProducedQuantity).toHaveValue(String(producedQuantity));
}

async function workflowConfirmStopWithoutTag(page: Page) {
  const { dialogContentNoTagPrinted } = getProductionLocators(page);
  await expect(dialogContentNoTagPrinted).toBeVisible();
  await dialogContentNoTagPrinted.getByTestId("button-confirm-no-tag-printed-stop-production-order").click();
  await expect(dialogContentNoTagPrinted).toBeHidden();
}

export async function assertProductionOrderStopped(
  page: Page,
  {
    expectedStatus,
    machine,
    producedQuantity,
    producedQuantityBefore,
    productionOrder,
  }: {
    expectedStatus: ProductionOrderStatus;
    machine: BaseMachine;
    producedQuantity: number;
    producedQuantityBefore: number;
    productionOrder: BaseProductionOrder;
  },
) {
  const {
    dialogContentMachineProductionOrderQueue,
    dialogContentStopProductionOrder,
    tableMachineProductionOrderQueue,
  } = getProductionLocators(page);
  const toasts = getToasts(page);
  await expect(dialogContentStopProductionOrder).toBeHidden();
  await expect(toasts).toHaveCount(1);
  expect(await getToastType(toasts.first())).toBe(ToastType.Success);
  await clearToasts(page);

  const dbUpdatedProductionOrder = await getProductionOrderById(productionOrder.id);
  expect(dbUpdatedProductionOrder).toBeDefined();
  expect(await getProductionOrderProducedQuantity(dbUpdatedProductionOrder!.id)).toBe(
    producedQuantity + producedQuantityBefore,
  );

  expect((await getMachineById(machine.id))?.activeProductionOrderId).toBeNull();

  expect(await dbGetProductionOrderStatus(dbUpdatedProductionOrder!)).toBe(expectedStatus);

  // Only Pending and In production orders are kept in the queue
  const isQueued = !isProductionFinished(expectedStatus);
  if (isQueued) {
    expect(await getQueuedProductionOrderIds(machine.id)).toContain(productionOrder.id);
  } else {
    expect(await getQueuedProductionOrderIds(machine.id)).not.toContain(productionOrder.id);
  }
  // Without an active production order the queue is opened to pick the next one
  await expect(dialogContentMachineProductionOrderQueue).toBeVisible();
  await expect(getTableRowByTestId(tableMachineProductionOrderQueue, productionOrder.id)).toBeAttached({
    attached: isQueued,
  });

  if (producedQuantity > 0) {
    const dbPartProduction = await getPartProductionsOfMachineAndPart({
      machineId: machine.id,
      partId: productionOrder.partId,
    });
    expect(dbPartProduction.length).toBeGreaterThan(0);
    expect(dbPartProduction[0].quantity).toBe(producedQuantity);
  }
}

export async function workflowStopActiveProductionOrder(
  page: Page,
  {
    expectedStatus,
    machine,
    producedQuantity,
  }: { expectedStatus: ProductionOrderStatus; machine: BaseMachine; producedQuantity: number },
) {
  const { dialogContentStopProductionOrder, inputProducedQuantity } = getProductionLocators(page);
  const productionOrder = await getActiveProductionOrder(machine);
  const producedQuantityBefore = await getProductionOrderProducedQuantity(productionOrder.id);

  await workflowOpenProduction(page, machine);
  await workflowOpenStopDialog(page);
  const confirmStopButton = dialogContentStopProductionOrder.getByTestId("button-confirm-stop-production-order");
  if (producedQuantity > 0) {
    await workflowFillProducedQuantity(page, producedQuantity);
    await confirmStopButton.click();
    await workflowConfirmStopWithoutTag(page);
  } else {
    await inputProducedQuantity.fill("0");
    await confirmStopButton.click();
  }

  await assertProductionOrderStopped(page, {
    expectedStatus,
    machine,
    producedQuantity,
    producedQuantityBefore,
    productionOrder,
  });
}

// A Máquina without an active Orden de producción is asked to start one of its queue
export async function workflowStartProductionOrderFromQueue(
  page: Page,
  machine: BaseMachine,
  productionOrderId: number,
) {
  const { dialogContentMachineProductionOrderQueue, tableMachineProductionOrderQueue } = getProductionLocators(page);
  const toasts = getToasts(page);
  await workflowOpenProduction(page, machine);
  expect((await getMachineById(machine.id))?.activeProductionOrderId).toBeNull();

  await expect(dialogContentMachineProductionOrderQueue).toBeVisible();
  await expect(tableMachineProductionOrderQueue).toBeVisible();

  const rowToStart = getTableRowByTestId(tableMachineProductionOrderQueue, productionOrderId);
  await expect(rowToStart).toBeVisible();

  const buttonStartProductionOrder = rowToStart.getByTestId("button-start-production-order");
  await expect(buttonStartProductionOrder).toBeVisible();
  await buttonStartProductionOrder.click();
  await expect(toasts).toHaveCount(1);
  expect(await getToastType(toasts.first())).toBe(ToastType.Success);
  await clearToasts(page);

  expect((await getMachineById(machine.id))?.activeProductionOrderId).toBe(productionOrderId);
  // Starting a production order moves it to the top of the queue
  expect((await getMachineProductionOrderQueue(machine.id)).at(0)?.id).toBe(productionOrderId);

  const dbUpdatedProductionOrder = await getProductionOrderById(productionOrderId);
  expect(dbUpdatedProductionOrder).toBeDefined();
  expect(await dbGetProductionOrderStatus(dbUpdatedProductionOrder!)).toBe(ProductionOrderStatus.InProduction);
}

export async function workflowAssignMachineToProductionOrder(
  page: Page,
  productionOrderId: number,
  machine: BaseMachine,
  expectedErrorMessage?: string,
) {
  await setUserMode(page, UserMode.Admin);
  // Only these can be assigned, and filtering by them shows every one in a single page
  await gotoProductionOrdersWithStatuses(page, [ProductionOrderStatus.Pending, ProductionOrderStatus.InProduction]);

  const comboboxAssignMachine = getTableRowByTestId(
    page.getByTestId("table-production-order"),
    productionOrderId,
  ).getByTestId("combobox-assign-machine");
  await openCombobox(comboboxAssignMachine);
  await fillComboboxFilter(page, machine.name);
  await clickInComboboxOption(page, machine.name);

  await expectSingleToast(page, expectedErrorMessage);
  expect((await getQueuedProductionOrderIds(machine.id)).includes(productionOrderId)).toBe(
    expectedErrorMessage === undefined,
  );
}

// Assigns the Orden de producción to every Máquina and starts it in each one of them
export async function workflowRunProductionOrderOnMachines(
  page: Page,
  productionOrderId: number,
  machines: Array<BaseMachine>,
) {
  for (const machine of machines) {
    await workflowAssignMachineToProductionOrder(page, productionOrderId, machine);
    await workflowStartProductionOrderFromQueue(page, machine, productionOrderId);
  }
}

export async function gotoProductionOrdersWithStatuses(page: Page, statuses: Array<ProductionOrderStatus>) {
  const state: TTableProductionOrderState = {
    filters: [{ id: "statuses", value: statuses }],
    pagination: { pageSize: mockProductionOrders.length },
  };
  await page.goto(`/production-order?${new URLSearchParams({ "table-production-order": JSON.stringify(state) })}`);
}

// The table has to be opened already, as the test decides which Órdenes de producción it lists
export async function workflowDeleteProductionOrder(page: Page, productionOrderId: number) {
  const rowProductionOrder = getTableRowByTestId(page.getByTestId("table-production-order"), productionOrderId);
  await openAndConfirmAlertDialog(page, rowProductionOrder.getByTestId("button-delete"), "dialog-delete-model-content");
  // The table only lists the pending Órdenes de producción and the ones in production
  await expect(rowProductionOrder).not.toBeVisible();
  expect((await getProductionOrderById(productionOrderId))?.deletedAt).not.toBeNull();
}

export async function workflowRestoreProductionOrder(page: Page, productionOrderId: number) {
  const rowProductionOrder = getTableRowByTestId(page.getByTestId("table-production-order"), productionOrderId);
  await gotoProductionOrdersWithStatuses(page, [ProductionOrderStatus.Deleted]);
  await openAndConfirmAlertDialog(
    page,
    rowProductionOrder.getByTestId("button-restore"),
    "dialog-restore-model-content",
  );
  await expect(rowProductionOrder).not.toBeVisible();
  expect((await getProductionOrderById(productionOrderId))?.deletedAt).toBeNull();
}

// The part is only picked when the Orden de producción is made by hand or its line has no part
export async function workflowCreateProductionOrder(
  page: Page,
  { sellOrderLineId, part }: { sellOrderLineId?: number; part?: BasePart },
  expectedErrorMessage?: string,
) {
  await setUserMode(page, UserMode.Admin);
  await page.goto(
    sellOrderLineId === undefined
      ? "/create-production-order"
      : `/create-production-order?sellOrderLineId=${sellOrderLineId}`,
  );
  await assertFormLoaded(page);
  if (sellOrderLineId !== undefined && part === undefined) {
    // The part of the line syncs after the line and resets the form, which would clear what is filled in before
    await expect(page.locator('a[href^="/part/"]').first()).toBeVisible();
  }
  if (part !== undefined) {
    const { dialogPickerPartContent, tablePickerPart } = await openPartPicker(
      page,
      getFormInputByLabel(page, "Artículo", InputElementType.Picker),
    );
    await tablePickerPart.getByTestId("input-filter-description").fill(part.description);
    await getTableRowByTestId(tablePickerPart, part.id).getByTestId("button-success").click();
    await expect(dialogPickerPartContent).not.toBeVisible();
  }
  await getFormInputByLabel(page, "Cantidad a fabricar", InputElementType.Number).fill("1");
  await page.getByTestId("button-submit").click();
  await expectSingleToast(page, expectedErrorMessage);
  if (expectedErrorMessage === undefined) {
    await expect(page).toHaveURL(/\/production-order\/\d+$/);
  } else {
    await expect(page).toHaveURL(/\/create-production-order/);
  }
}
