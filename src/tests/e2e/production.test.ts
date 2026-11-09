import path from "node:path";

import { expect } from "@playwright/test";
import type { Locator } from "@playwright/test";

import { getMachineById } from "@/db/functions/machine";
import { getMachineProductionOrderQueue } from "@/db/functions/machine-production-order-queue";
import { getProductionOrderById, getProductionOrderProducedQuantity } from "@/db/functions/production-order";
import { CLIENT_LABEL, NOTES_LABEL } from "@/messages/common";
import { ProductionOrderStatus } from "@/schemas/production-order";
import { mockMachineProductionOrderQueues, mockMachines, mockProductionOrders } from "@/tests/mock-data";
import { getTestId } from "@/tests/utils/components";
import { InputElementType, getFormInputByLabel } from "@/tests/utils/components/form";
import { getTableRowByTestId, getTableRowByPosition, getTableRows } from "@/tests/utils/components/table";
import { expectSingleToast } from "@/tests/utils/components/toast";
import { TestAnnotations, test } from "@/tests/utils/fixtures";
import {
  getMockProducedProductionOrderStatus,
  getMockUnstartedProductionOrdersWithoutQuantity,
} from "@/tests/utils/mock-data-utils";
import {
  assertProductionOrderStopped,
  getActiveProductionOrder,
  getProductionLocators,
  getProductionOrderClientName,
  getQueuedProductionOrderIds,
  workflowFillProducedQuantity,
  workflowOpenProduction,
  workflowOpenStopDialog,
  workflowRunProductionOrderOnMachines,
  workflowStartProductionOrderFromQueue,
  workflowStopActiveProductionOrder,
} from "@/tests/workflows/production";
import { assertTagFileGenerated } from "@/tests/workflows/tag";
import type { BaseMachine } from "@/types/machine";

const getMockQueue = (machine: BaseMachine) =>
  mockMachineProductionOrderQueues.filter((queue) => queue.machineId === machine.id);
const activeMachines = mockMachines.filter((machine) => machine.deletedAt === null);
// Máquinas working on an Orden de producción while others wait in their queue
const busyMachines = activeMachines.filter(
  (machine) => machine.activeProductionOrderId !== null && getMockQueue(machine).length > 1,
);
const idleMachines = activeMachines.filter((machine) => machine.activeProductionOrderId === null);

let formMachineProductionOrder: Locator;
let dialogContentStopProductionOrder: Locator;
let dialogContentNoTagPrinted: Locator;
let dialogContentMachineProductionOrderQueue: Locator;
let tableMachineProductionOrderQueue: Locator;
let inputProducedQuantity: Locator;

test.beforeEach(({ page }) => {
  ({
    dialogContentMachineProductionOrderQueue,
    dialogContentNoTagPrinted,
    dialogContentStopProductionOrder,
    formMachineProductionOrder,
    inputProducedQuantity,
    tableMachineProductionOrderQueue,
  } = getProductionLocators(page));
});

test(
  "work on the production orders of the machines",
  { annotation: [TestAnnotations.UserModeMachine, TestAnnotations.ResetTags] },
  async ({ page, toasts }) => {
    expect(busyMachines.length, "Wrong test set up: Some Máquina should work with others queued").toBeGreaterThan(0);

    for (const userMachine of busyMachines) {
      const machineProductionOrderQueue = await getMachineProductionOrderQueue(userMachine.id);
      const activeProductionOrderId = (await getMachineById(userMachine.id))!.activeProductionOrderId!;
      const queuedProductionOrder = machineProductionOrderQueue.find((po) => po.id !== activeProductionOrderId)!;
      expect(queuedProductionOrder).toBeDefined();

      await test.step(`update the production order of ${userMachine.name}`, async () => {
        await workflowOpenProduction(page, userMachine);

        const dbProductionOrder = await getActiveProductionOrder(userMachine);

        const inputClient = getFormInputByLabel(formMachineProductionOrder, CLIENT_LABEL, InputElementType.Input);
        await expect(inputClient).toHaveValue(await getProductionOrderClientName(dbProductionOrder));

        const newNotes = `Updated production order notes of ${userMachine.name}`;
        const inputNotes = getFormInputByLabel(formMachineProductionOrder, NOTES_LABEL, InputElementType.Textarea);
        await expect(inputNotes).toBeVisible();
        expect(await inputNotes.inputValue()).toBe(dbProductionOrder.notes ?? "");

        await inputNotes.clear();
        await inputNotes.fill(newNotes);
        await inputNotes.blur();

        await expectSingleToast(page);

        const updatedDbProductionOrder = await getProductionOrderById(dbProductionOrder.id);
        expect(updatedDbProductionOrder).toBeDefined();
        expect(updatedDbProductionOrder!.notes).toBe(newNotes);
      });

      await test.step(`move to the queue start a production order of ${userMachine.name}`, async () => {
        const lastProductionOrderInQueue = machineProductionOrderQueue[machineProductionOrderQueue.length - 1];

        const buttonDialogTriggerMachineProductionOrderQueue = page.getByTestId(
          "button-dialog-trigger-machine-production-order-queue",
        );
        await expect(buttonDialogTriggerMachineProductionOrderQueue).toBeVisible();
        await buttonDialogTriggerMachineProductionOrderQueue.click();

        await expect(dialogContentMachineProductionOrderQueue).toBeVisible();
        await expect(tableMachineProductionOrderQueue).toBeVisible();

        // Assert that the production orders are displayed in the queue
        const tableRows = await getTableRows(tableMachineProductionOrderQueue).all();
        expect(tableRows.length).toBe(machineProductionOrderQueue.length);
        expect(new Set(await Promise.all(tableRows.map(async (row) => getTestId(row))))).toEqual(
          new Set(machineProductionOrderQueue.map((item) => item.id)),
        );

        const rowToMove = getTableRowByTestId(tableMachineProductionOrderQueue, lastProductionOrderInQueue.id);
        await expect(rowToMove).toBeVisible();

        const buttonMoveToQueueStart = rowToMove.getByTestId("button-move-production-order-to-queue-start");
        await expect(buttonMoveToQueueStart).toBeVisible();
        await buttonMoveToQueueStart.click();

        await expectSingleToast(page);

        const dbUpdatedMachineProductionOrdersQueue = await getMachineProductionOrderQueue(userMachine.id);
        expect(dbUpdatedMachineProductionOrdersQueue.length).toBe(machineProductionOrderQueue.length);
        expect(dbUpdatedMachineProductionOrdersQueue[0].id).toBe(lastProductionOrderInQueue.id);

        expect(await getTestId(getTableRowByPosition(tableMachineProductionOrderQueue, 0))).toBe(
          lastProductionOrderInQueue.id,
        );
      });

      await test.step(`cancel stopping the production order of ${userMachine.name} when no tag has been printed`, async () => {
        await workflowOpenProduction(page, userMachine);
        const producedQuantityBefore = await getProductionOrderProducedQuantity(activeProductionOrderId);

        await workflowOpenStopDialog(page);
        await inputProducedQuantity.fill("1");
        await expect(inputProducedQuantity).toHaveValue("1");

        await dialogContentStopProductionOrder.getByTestId("button-confirm-stop-production-order").click();

        await expect(dialogContentNoTagPrinted).toBeVisible();
        await dialogContentNoTagPrinted.getByTestId("button-close").click();

        // Only the warning is closed, the stop dialog keeps the filled in quantity
        await expect(dialogContentNoTagPrinted).toBeHidden();
        await expect(dialogContentStopProductionOrder).toBeVisible();
        await expect(inputProducedQuantity).toHaveValue("1");
        await expect(toasts).toHaveCount(0);

        expect((await getMachineById(userMachine.id))?.activeProductionOrderId).toBe(activeProductionOrderId);
        expect(await getProductionOrderProducedQuantity(activeProductionOrderId)).toBe(producedQuantityBefore);
      });

      await test.step(`stop the production order of ${userMachine.name} without producing or with an empty quantity, no tag is required`, async () => {
        await workflowOpenProduction(page, userMachine);
        const producedQuantityBefore = await getProductionOrderProducedQuantity(activeProductionOrderId);

        await workflowOpenStopDialog(page);

        // A tag cannot be printed without produced units
        const printTagButton = dialogContentStopProductionOrder.getByTestId("button-print-tag-stop-production-order");
        await expect(printTagButton).toBeDisabled();
        await inputProducedQuantity.fill("0");
        await expect(inputProducedQuantity).toHaveValue("0");
        await expect(printTagButton).toBeDisabled();

        // An empty quantity is stopped as nothing produced
        await inputProducedQuantity.clear();
        await expect(inputProducedQuantity).toHaveValue("");
        await expect(printTagButton).toBeDisabled();

        await dialogContentStopProductionOrder.getByTestId("button-confirm-stop-production-order").click();

        await expect(dialogContentNoTagPrinted).toBeHidden();
        await expect(dialogContentStopProductionOrder).toBeHidden();

        await expectSingleToast(page);

        expect((await getMachineById(userMachine.id))?.activeProductionOrderId).toBeNull();
        expect(await getProductionOrderProducedQuantity(activeProductionOrderId)).toBe(producedQuantityBefore);
        // A stopped production order stays in the queue of the machine
        expect(await getQueuedProductionOrderIds(userMachine.id)).toContain(activeProductionOrderId);
      });

      await test.step(`stop the production order of ${userMachine.name}, produce less than the pending quantity`, async () => {
        await workflowStartProductionOrderFromQueue(page, userMachine, activeProductionOrderId);
        const dbProductionOrder = await getActiveProductionOrder(userMachine);
        const producedQuantityBefore = await getProductionOrderProducedQuantity(dbProductionOrder.id);
        const producedQuantity = Math.floor(((dbProductionOrder.quantity ?? 0) - producedQuantityBefore) / 2);
        expect(producedQuantity, "Wrong test set up: At least 2 units should be pending").toBeGreaterThan(0);

        await workflowStopActiveProductionOrder(page, {
          expectedStatus: ProductionOrderStatus.Pending,
          machine: userMachine,
          producedQuantity,
        });
      });

      await test.step(`stop the production order of ${userMachine.name}, produce the whole remaining quantity`, async () => {
        await workflowStartProductionOrderFromQueue(page, userMachine, activeProductionOrderId);
        const dbProductionOrder = await getActiveProductionOrder(userMachine);

        await workflowOpenStopDialog(page);
        const producedQuantityBefore = await getProductionOrderProducedQuantity(dbProductionOrder.id);
        const producedQuantity = (dbProductionOrder.quantity ?? 0) - producedQuantityBefore;
        await workflowFillProducedQuantity(page, producedQuantity);

        const tagFilePath = path.join(process.env.TAGS_ROOT_PATH!, `production-order-${dbProductionOrder.id}.pdf`);
        const printTagButton = dialogContentStopProductionOrder.getByTestId("button-print-tag-stop-production-order");
        await expect(printTagButton).toBeEnabled();
        await printTagButton.click();

        await expectSingleToast(page);

        assertTagFileGenerated(tagFilePath);

        const confirmStopButton = dialogContentStopProductionOrder.getByTestId("button-confirm-stop-production-order");
        await expect(confirmStopButton).toBeVisible();
        await confirmStopButton.click();

        // The tag has already been printed, so the production order is stopped without asking for confirmation
        await expect(dialogContentNoTagPrinted).toBeHidden();

        await assertProductionOrderStopped(page, {
          expectedStatus: getMockProducedProductionOrderStatus(dbProductionOrder.id),
          machine: userMachine,
          producedQuantity,
          producedQuantityBefore,
          productionOrder: dbProductionOrder,
        });
      });

      await test.step(`stop the production order of ${userMachine.name}, produce more than the pending quantity`, async () => {
        await workflowStartProductionOrderFromQueue(page, userMachine, queuedProductionOrder.id);
        const dbProductionOrder = await getActiveProductionOrder(userMachine);
        const producedQuantityBefore = await getProductionOrderProducedQuantity(dbProductionOrder.id);

        await workflowStopActiveProductionOrder(page, {
          expectedStatus: getMockProducedProductionOrderStatus(dbProductionOrder.id),
          machine: userMachine,
          producedQuantity: ((dbProductionOrder.quantity ?? 0) - producedQuantityBefore) * 2,
        });
      });
    }
  },
);

test("start every queued production order of the machines with no active production order", async ({ page }) => {
  const idleMachinesWithQueue = idleMachines.filter((machine) => getMockQueue(machine).length > 0);
  expect(idleMachinesWithQueue.length, "Wrong test set up: Some idle Máquina should have a queue").toBeGreaterThan(0);

  for (const machine of idleMachinesWithQueue) {
    for (const queue of getMockQueue(machine)) {
      await workflowStartProductionOrderFromQueue(page, machine, queue.productionOrderId);

      // Stopping it without producing keeps it queued for the next one
      await workflowStopActiveProductionOrder(page, {
        expectedStatus: ProductionOrderStatus.Pending,
        machine,
        producedQuantity: 0,
      });
    }
  }
});

test("work on every production order without a quantity", async ({ page }) => {
  const machinesWithoutQueue = idleMachines.filter((machine) => getMockQueue(machine).length === 0);
  expect(machinesWithoutQueue.length, "Wrong test set up: Some Máquina should be idle").toBeGreaterThan(0);

  for (const [index, productionOrder] of getMockUnstartedProductionOrdersWithoutQuantity().entries()) {
    const machine = machinesWithoutQueue[index % machinesWithoutQueue.length];
    await workflowRunProductionOrderOnMachines(page, productionOrder.id, [machine]);

    await test.step(`stop ${productionOrder.id} without producing, it is still pending`, async () => {
      await workflowStopActiveProductionOrder(page, {
        expectedStatus: ProductionOrderStatus.Pending,
        machine,
        producedQuantity: 0,
      });
    });

    await test.step(`stop ${productionOrder.id} after producing, it is completed`, async () => {
      await workflowStartProductionOrderFromQueue(page, machine, productionOrder.id);
      await workflowStopActiveProductionOrder(page, {
        expectedStatus: getMockProducedProductionOrderStatus(productionOrder.id),
        machine,
        producedQuantity: 4,
      });
    });
  }
});

test("work on a production order running on several machines", async ({ page }) => {
  expect(idleMachines.length, "Wrong test set up: Some Máquinas should be idle").toBeGreaterThan(1);
  const [firstMachine, ...otherMachines] = idleMachines;

  await test.step("with a quantity, it leaves the queues of the machines not running it once completed", async () => {
    // Queued, but not active, in a Máquina that is not used to run it
    const otherMachineQueues = mockMachineProductionOrderQueues.filter(
      (queue) =>
        !idleMachines.some((machine) => machine.id === queue.machineId) &&
        mockMachines.find((machine) => machine.id === queue.machineId)?.activeProductionOrderId !==
          queue.productionOrderId &&
        mockProductionOrders.find((productionOrder) => productionOrder.id === queue.productionOrderId)?.quantity !==
          null,
    );
    expect(otherMachineQueues.length, "Wrong test set up: Some Orden de producción should be queued").toBeGreaterThan(
      0,
    );

    for (const otherMachineQueue of otherMachineQueues) {
      const productionOrder = (await getProductionOrderById(otherMachineQueue.productionOrderId))!;
      await workflowRunProductionOrderOnMachines(page, productionOrder.id, idleMachines);

      const producedQuantityBefore = await getProductionOrderProducedQuantity(productionOrder.id);
      await workflowStopActiveProductionOrder(page, {
        expectedStatus: getMockProducedProductionOrderStatus(productionOrder.id),
        machine: firstMachine,
        producedQuantity: productionOrder.quantity! - producedQuantityBefore,
      });
      expect(await getQueuedProductionOrderIds(otherMachineQueue.machineId)).not.toContain(productionOrder.id);

      // The other Máquinas running it can still report what they have produced
      for (const machine of otherMachines) {
        expect(await getQueuedProductionOrderIds(machine.id)).toContain(productionOrder.id);
        expect((await getMachineById(machine.id))?.activeProductionOrderId).toBe(productionOrder.id);
      }
      for (const machine of otherMachines) {
        await workflowStopActiveProductionOrder(page, {
          expectedStatus: getMockProducedProductionOrderStatus(productionOrder.id),
          machine,
          producedQuantity: 0,
        });
      }
    }
  });

  await test.step("without a quantity, it is in production until the last machine running it stops", async () => {
    for (const productionOrder of getMockUnstartedProductionOrdersWithoutQuantity()) {
      await workflowRunProductionOrderOnMachines(page, productionOrder.id, idleMachines);

      for (const machine of idleMachines.slice(0, -1)) {
        await workflowStopActiveProductionOrder(page, {
          expectedStatus: ProductionOrderStatus.InProduction,
          machine,
          producedQuantity: 5,
        });
      }

      await workflowStopActiveProductionOrder(page, {
        expectedStatus: getMockProducedProductionOrderStatus(productionOrder.id),
        machine: idleMachines.at(-1)!,
        producedQuantity: 0,
      });
      for (const machine of idleMachines) {
        expect(await getQueuedProductionOrderIds(machine.id)).not.toContain(productionOrder.id);
      }
    }
  });
});
