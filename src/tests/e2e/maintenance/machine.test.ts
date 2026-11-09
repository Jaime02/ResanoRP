import { expect } from "@playwright/test";
import type { Locator } from "@playwright/test";
import { eq } from "drizzle-orm";

import { UserMode } from "@/contexts/app-context";
import { getMachineById } from "@/db/functions/machine";
import { MACHINE_NAME_CONSTRAINT, dbTableMachine, dbTablePartProduction } from "@/db/schema";
import { NO_MACHINES_MESSAGE } from "@/messages/combobox";
import { CLOSE_LABEL, STATUS_PENDING_LABEL, NAME_LABEL } from "@/messages/common";
import {
  MACHINE_CREATE_TITLE,
  MACHINE_DELETED_MESSAGE,
  MACHINE_RESTORED_MESSAGE,
  SHOW_DELETED_MACHINES_LABEL,
  VIEW_MACHINES_LABEL,
  MACHINE_MAX_DIAMETER_LABEL,
  MACHINE_MIN_DIAMETER_LABEL,
} from "@/messages/machine";
import { ProductionOrderStatus } from "@/schemas/production-order";
import {
  MOCK_INITIAL_DATE,
  mockMachineProductionOrderQueues,
  mockMachines,
  mockPartProduction,
} from "@/tests/mock-data";
import { openAndConfirmAlertDialog } from "@/tests/utils/components/alert-dialog";
import { assertFormLoaded, getFormInputByLabel } from "@/tests/utils/components/form";
import {
  assertTableRowCount,
  filterByExactText,
  findTableRowByText,
  getTableRowByTestId,
  getTableRows,
} from "@/tests/utils/components/table";
import { expectSingleToast } from "@/tests/utils/components/toast";
import { expectUniqueViolationRejected, uniqueNameViolation } from "@/tests/utils/errors-log";
import { test } from "@/tests/utils/fixtures";
import {
  EditButtonVisibility,
  workflowDeletedFilterAndRestore,
  workflowRestoreTaken,
} from "@/tests/workflows/deleted-filter";
import { workflowCreateMachine, workflowDeleteMachine, workflowEditMachine } from "@/tests/workflows/machine";
import { workflowRejectCreateWithTakenName, workflowRejectRenameToTakenName } from "@/tests/workflows/unique-name";
import { MACHINE_PRODUCTION_HISTORY_PAGE_SIZE } from "@/types/machine";
import type { BaseMachineProductionOrderQueue } from "@/types/machine-production-order-queue";

const MAINTENANCE_MACHINE_URL = "/maintenance?tab=machine";
const NAME_TAKEN_MESSAGE = "Existe una Máquina con el mismo nombre";
const NEW_MACHINE_ID = Math.max(...mockMachines.map((machine) => machine.id)) + 1;

const activeMachines = mockMachines.filter((machine) => machine.deletedAt === null);

type TQueueKey = Pick<BaseMachineProductionOrderQueue, "machineId" | "productionOrderId">;
const compareQueues = (a: TQueueKey, b: TQueueKey) =>
  a.machineId - b.machineId || a.productionOrderId - b.productionOrderId;

let tableMaintenanceMachine: Locator;
let dialogCreateMachine: Locator;
let formMachine: Locator;
let tableMachineProductionHistory: Locator;

test.beforeEach(({ page }) => {
  tableMaintenanceMachine = page.getByTestId("table-machine");
  dialogCreateMachine = page.getByTestId("dialog-create-machine");
  formMachine = page.getByTestId("form-machine");
  tableMachineProductionHistory = page.getByTestId("table-machine-production-history");
});

test("manage the machines", async ({ page, db }) => {
  const newMachineName = "ID-4 Fresadora";
  const openCreateMachine = async () => {
    await page.getByRole("button", { name: MACHINE_CREATE_TITLE }).click();
    await expect(dialogCreateMachine).toBeVisible();
  };

  await test.step("render the machines table at /maintenance", async () => {
    await page.goto(MAINTENANCE_MACHINE_URL);

    for (const machine of activeMachines) {
      await expect(tableMaintenanceMachine.getByText(machine.name, { exact: true })).toBeVisible();
    }
  });

  await test.step("render the machine form at /machine/$id", async () => {
    expect(
      activeMachines.some((machine) => mockPartProduction.some((production) => production.machineId === machine.id)),
      "Wrong test set up: Some Máquina should have produced",
    ).toBe(true);

    for (const machine of activeMachines) {
      const machineProductions = mockPartProduction.filter((production) => production.machineId === machine.id);
      await page.goto(`/machine/${machine.id}`);

      await expect(formMachine).toBeVisible();
      await assertFormLoaded(formMachine);
      await expect(getFormInputByLabel(formMachine, NAME_LABEL)).toHaveValue(machine.name);

      await expect(tableMachineProductionHistory).toBeVisible();
      await assertTableRowCount(tableMachineProductionHistory, machineProductions.length);

      await formMachine.getByRole("button", { name: VIEW_MACHINES_LABEL }).click();

      await expect(page).toHaveURL(MAINTENANCE_MACHINE_URL);
      await expect(tableMaintenanceMachine.getByText(machine.name, { exact: true })).toBeVisible();
    }
  });

  await test.step("page the production history of a machine", async () => {
    const [machine] = activeMachines;
    const productionCount =
      mockPartProduction.filter((production) => production.machineId === machine.id).length +
      MACHINE_PRODUCTION_HISTORY_PAGE_SIZE;
    await db.insert(dbTablePartProduction).values(
      Array.from({ length: MACHINE_PRODUCTION_HISTORY_PAGE_SIZE }, () => ({
        date: MOCK_INITIAL_DATE,
        machineId: machine.id,
        productionOrderId: mockPartProduction[0].productionOrderId,
        quantity: 1,
      })),
    );

    await page.goto(`/machine/${machine.id}`);
    await expect(getTableRows(tableMachineProductionHistory)).toHaveCount(MACHINE_PRODUCTION_HISTORY_PAGE_SIZE);
    await expect(
      page.getByText(`Página 1 de ${Math.ceil(productionCount / MACHINE_PRODUCTION_HISTORY_PAGE_SIZE)}`),
    ).toBeVisible();
  });

  await test.step("open create dialog when createMachine search param is true", async () => {
    await page.goto("/maintenance?tab=machine&createMachine=true");
    await expect(dialogCreateMachine).toBeVisible();
  });

  await test.step("create a new machine", async () => {
    await workflowCreateMachine(page, NEW_MACHINE_ID, newMachineName);
  });

  await test.step("update the name of every machine", async () => {
    for (const machine of activeMachines) {
      const updatedName = `${machine.name} actualizado`;

      await workflowEditMachine(page, machine.id, machine.name, updatedName);

      await formMachine.getByRole("button", { name: VIEW_MACHINES_LABEL }).click();

      await expect(tableMaintenanceMachine.getByText(updatedName, { exact: true })).toBeVisible();
      await expect(tableMaintenanceMachine.getByText(machine.name, { exact: true })).not.toBeVisible();
    }

    expect(
      await db.query.dbTableMachine.findMany({ columns: { id: true, name: true }, orderBy: { id: "asc" } }),
    ).toEqual([
      ...mockMachines.map(({ id, name, deletedAt }) => ({
        id,
        name: deletedAt === null ? `${name} actualizado` : name,
      })),
      { id: NEW_MACHINE_ID, name: newMachineName },
    ]);
  });

  await test.step("keep the name of a Máquina unique while it is not deleted", async () => {
    const machines = await db.query.dbTableMachine.findMany({
      orderBy: { id: "asc" },
      where: { deletedAt: { isNull: true } },
    });
    expect(machines).toHaveLength(activeMachines.length + 1);

    await page.goto(MAINTENANCE_MACHINE_URL);
    await workflowRejectCreateWithTakenName({
      page,
      items: machines,
      form: dialogCreateMachine,
      openCreate: openCreateMachine,
      closeCreate: async () => {
        await dialogCreateMachine.getByTestId("button-close").click();
        await expect(dialogCreateMachine).not.toBeVisible();
      },
      insertDuplicate: async (name) => db.insert(dbTableMachine).values({ name }),
      constraintName: MACHINE_NAME_CONSTRAINT,
      table: dbTableMachine,
      errorMessage: NAME_TAKEN_MESSAGE,
    });

    await workflowRejectRenameToTakenName({
      page,
      items: machines,
      form: formMachine,
      openEdit: async (machine) => {
        await page.goto(`/machine/${machine.id}`);
      },
      getName: async (id) => (await getMachineById(id))?.name,
      table: dbTableMachine,
      constraintName: MACHINE_NAME_CONSTRAINT,
      errorMessage: NAME_TAKEN_MESSAGE,
    });

    for (const machine of machines) {
      // Deleting a Máquina frees its name, also typed with spaces around it...
      await workflowDeleteMachine(page, machine.id, machine.name);

      await openCreateMachine();
      await getFormInputByLabel(dialogCreateMachine, NAME_LABEL).fill(`  ${machine.name}  `);
      await dialogCreateMachine.getByTestId("button-submit").click();

      await expect(dialogCreateMachine).not.toBeVisible();
      await expectSingleToast(page);
      await expect(tableMaintenanceMachine.getByText(machine.name, { exact: true })).toBeVisible();

      // ...so the deleted Máquina can no longer be restored
      await page.goto(`/machine/${machine.id}`);
      await assertFormLoaded(formMachine);
      await openAndConfirmAlertDialog(page, formMachine.getByTestId("button-restore"), "dialog-restore-model-content");
      await expectSingleToast(page, NAME_TAKEN_MESSAGE);
      expectUniqueViolationRejected(
        uniqueNameViolation(MACHINE_NAME_CONSTRAINT, dbTableMachine, machine.name),
        NAME_TAKEN_MESSAGE,
      );

      expect((await getMachineById(machine.id))?.deletedAt).toBeInstanceOf(Date);
    }
  });
});

test("delete every machine, emptying its queue but keeping what it produced, and restore it", async ({ page, db }) => {
  expect(
    activeMachines.some(
      (machine) =>
        machine.activeProductionOrderId !== null &&
        mockMachineProductionOrderQueues.filter((queue) => queue.machineId === machine.id).length > 1,
    ),
    "Wrong test set up: Some Máquina should work on an Orden de producción and have others queued",
  ).toBe(true);

  const deletedMachineIds = new Set(mockMachines.filter((machine) => machine.deletedAt !== null).map(({ id }) => id));
  const getActiveMachines = () => mockMachines.filter((machine) => !deletedMachineIds.has(machine.id));
  const tableProductionOrder = page.getByTestId("table-production-order");
  const inProductionState = { filters: [{ id: "statuses", value: [ProductionOrderStatus.InProduction] }] };
  const productionOrderInProductionUrl = `/production-order?${new URLSearchParams({ "table-production-order": JSON.stringify(inProductionState) })}`;

  for (const machine of activeMachines) {
    await workflowDeleteMachine(page, machine.id, machine.name);
    deletedMachineIds.add(machine.id);

    for (const otherMachine of getActiveMachines()) {
      await expect(tableMaintenanceMachine.getByText(otherMachine.name, { exact: true })).toBeVisible();
    }

    // Its queue is emptied and it stops working on its Orden de producción...
    expect(
      await db.query.dbTableMachine.findMany({
        columns: { activeProductionOrderId: true, id: true },
        orderBy: { id: "asc" },
      }),
    ).toEqual(
      mockMachines.map(({ activeProductionOrderId, id }) => ({
        activeProductionOrderId: deletedMachineIds.has(id) ? null : activeProductionOrderId,
        id,
      })),
    );
    expect(
      (
        await db.query.dbTableMachineProductionOrderQueue.findMany({
          columns: { machineId: true, productionOrderId: true },
        })
      ).sort(compareQueues),
    ).toEqual(
      mockMachineProductionOrderQueues
        .filter((queue) => !deletedMachineIds.has(queue.machineId))
        .map(({ machineId, productionOrderId }) => ({ machineId, productionOrderId }))
        .sort(compareQueues),
    );

    // ...but what it produced is kept
    expect(
      await db.query.dbTablePartProduction.findMany({ columns: { id: true, machineId: true }, orderBy: { id: "asc" } }),
    ).toEqual(mockPartProduction.map(({ id, machineId }) => ({ id, machineId })));

    await page.goto("/production-order");
    for (const queue of mockMachineProductionOrderQueues.filter((mockQueue) => mockQueue.machineId === machine.id)) {
      await expect(
        getTableRowByTestId(tableProductionOrder, queue.productionOrderId).getByTestId(
          `div-assigned-machine-${machine.id}`,
        ),
      ).toHaveCount(0);
    }
    if (machine.activeProductionOrderId !== null) {
      await expect(
        getTableRowByTestId(tableProductionOrder, machine.activeProductionOrderId).getByTestId("status"),
      ).toHaveText(STATUS_PENDING_LABEL);
    }

    // Only the Órdenes de producción of the remaining Máquinas are still in production
    const inProductionOrderIds = new Set(
      getActiveMachines().flatMap(({ activeProductionOrderId }) =>
        activeProductionOrderId === null ? [] : [activeProductionOrderId],
      ),
    );
    await page.goto(productionOrderInProductionUrl);
    await assertTableRowCount(tableProductionOrder, inProductionOrderIds.size);

    await page.goto(`/machine/${machine.id}`);
    await assertFormLoaded(formMachine);

    // A deleted machine is read only until it is restored
    await expect(formMachine.getByText(MACHINE_DELETED_MESSAGE, { exact: true })).toBeVisible();
    await expect(formMachine.getByTestId("button-submit")).toHaveCount(0);

    // The restore dialog lists the machine, and cancelling it keeps the machine deleted
    await formMachine.getByTestId("button-restore").click();
    const dialogRestoreMachine = page.getByTestId("dialog-restore-model-content");
    await expect(dialogRestoreMachine).toContainText(machine.name);
    await dialogRestoreMachine.getByTestId("button-close").click();
    await expect(dialogRestoreMachine).not.toBeVisible();
    await expect(formMachine.getByText(MACHINE_DELETED_MESSAGE, { exact: true })).toBeVisible();
    expect((await getMachineById(machine.id))?.deletedAt).toBeInstanceOf(Date);

    await openAndConfirmAlertDialog(page, formMachine.getByTestId("button-restore"), "dialog-restore-model-content");
    await expectSingleToast(page);

    await expect(formMachine.getByText(MACHINE_DELETED_MESSAGE, { exact: true })).not.toBeVisible();
    await expect(formMachine.getByTestId("button-submit")).toBeVisible();

    // Restoring it does not bring its queue nor its Orden de producción back
    const restoredMachine = await getMachineById(machine.id);
    expect(restoredMachine?.deletedAt).toBeNull();
    expect(restoredMachine?.activeProductionOrderId).toBeNull();
    expect(
      await db.query.dbTableMachineProductionOrderQueue.findMany({ where: { machineId: machine.id } }),
    ).toHaveLength(0);
  }
});

test("close the session of every Machine that is deleted while in use", async ({ page, openPage }) => {
  for (const [index, machine] of activeMachines.entries()) {
    const remainingMachines = activeMachines.slice(index + 1);
    const machinePage = await openPage({ machineId: machine.id, userMode: UserMode.Machine });
    await machinePage.goto("/production");

    await expect(machinePage.getByTestId("span-current-user-mode")).toHaveText(machine.name);
    await expect(machinePage.getByTestId("form-login")).not.toBeVisible();

    await workflowDeleteMachine(page, machine.id, machine.name);

    // The session is closed and the user mode has to be picked again
    await expect(machinePage.getByTestId("form-login")).toBeVisible();
    await expect(machinePage.getByTestId("span-current-user-mode")).toBeEmpty();
    await expect(machinePage).toHaveURL("/");

    // The deleted Machine is no longer selectable, only the remaining ones are
    await machinePage.getByRole("button", { name: UserMode.Machine }).click();
    const dialogMachineSelection = machinePage.getByTestId("form-machine-selection");
    await expect(dialogMachineSelection).toBeVisible();
    const machineButtons = dialogMachineSelection.getByRole("button");
    await expect(machineButtons).toHaveCount(remainingMachines.length);
    for (const remainingMachine of remainingMachines) {
      await expect(filterByExactText(machineButtons, remainingMachine.name)).toHaveCount(1);
    }
    await expect(filterByExactText(machineButtons, machine.name)).toHaveCount(0);
    if (remainingMachines.length === 0) {
      await expect(dialogMachineSelection.getByText(NO_MACHINES_MESSAGE)).toBeVisible();
    }
  }
});

test("set the diameter range of the machines", async ({ page, toasts }) => {
  const newMachineName = "ID-4 Fresadora";

  await test.step("create a machine with only a minimum diameter", async () => {
    await page.goto("/maintenance?tab=machine&createMachine=true");
    await expect(dialogCreateMachine).toBeVisible();

    await getFormInputByLabel(dialogCreateMachine, NAME_LABEL).fill(newMachineName);
    await getFormInputByLabel(dialogCreateMachine, MACHINE_MIN_DIAMETER_LABEL).fill("15");
    await dialogCreateMachine.getByTestId("button-submit").click();

    await expect(dialogCreateMachine).not.toBeVisible();
    await expectSingleToast(page);
    const createdMachine = await getMachineById(NEW_MACHINE_ID);
    expect(createdMachine?.name).toBe(newMachineName);
    expect(createdMachine?.minDiameter).toBe(15);
    expect(createdMachine?.maxDiameter).toBeNull();

    // The delete dialog lists the diameters of the machine
    await (await findTableRowByText(tableMaintenanceMachine, newMachineName)).getByTestId("button-delete").click();
    const dialogDeleteMachine = page.getByTestId("dialog-delete-model-content");
    await expect(dialogDeleteMachine).toContainText(/Diámetro mínimo:\s*15/);
    await expect(dialogDeleteMachine).toContainText(/Diámetro máximo:\s*No disponible/);
    await dialogDeleteMachine.getByRole("button", { name: CLOSE_LABEL }).click();
    await expect(dialogDeleteMachine).not.toBeVisible();
  });

  for (const machine of activeMachines) {
    await test.step(`reject a maximum diameter lower than the minimum of ${machine.name}`, async () => {
      await page.goto(`/machine/${machine.id}`);
      await assertFormLoaded(formMachine);

      await getFormInputByLabel(formMachine, MACHINE_MIN_DIAMETER_LABEL).fill("50");
      await getFormInputByLabel(formMachine, MACHINE_MAX_DIAMETER_LABEL).fill("20");
      await formMachine.getByTestId("button-submit").click();

      await expect(formMachine.getByText("El diámetro máximo no puede ser menor que el mínimo")).toBeVisible();
      await expect(toasts).toHaveCount(0);
      const notUpdatedMachine = await getMachineById(machine.id);
      expect(notUpdatedMachine?.minDiameter).toBe(machine.minDiameter);
      expect(notUpdatedMachine?.maxDiameter).toBe(machine.maxDiameter);
    });

    await test.step(`update the diameter range of ${machine.name}`, async () => {
      await getFormInputByLabel(formMachine, MACHINE_MAX_DIAMETER_LABEL).fill("80");
      await formMachine.getByTestId("button-submit").click();

      await expectSingleToast(page);
      const updatedMachine = await getMachineById(machine.id);
      expect(updatedMachine?.minDiameter).toBe(50);
      expect(updatedMachine?.maxDiameter).toBe(80);

      await page.reload();
      await assertFormLoaded(formMachine);
      await expect(getFormInputByLabel(formMachine, MACHINE_MIN_DIAMETER_LABEL)).toHaveValue("50 mm");
      await expect(getFormInputByLabel(formMachine, MACHINE_MAX_DIAMETER_LABEL)).toHaveValue("80 mm");
    });

    await test.step(`both diameters of ${machine.name} are optional`, async () => {
      await getFormInputByLabel(formMachine, MACHINE_MIN_DIAMETER_LABEL).clear();
      await getFormInputByLabel(formMachine, MACHINE_MAX_DIAMETER_LABEL).clear();
      await formMachine.getByTestId("button-submit").click();

      await expectSingleToast(page);
      const updatedMachine = await getMachineById(machine.id);
      expect(updatedMachine?.minDiameter).toBeNull();
      expect(updatedMachine?.maxDiameter).toBeNull();
    });

    await test.step(`a diameter of 0 mm is rejected for ${machine.name}`, async () => {
      for (const label of [MACHINE_MIN_DIAMETER_LABEL, MACHINE_MAX_DIAMETER_LABEL]) {
        const inputDiameter = getFormInputByLabel(formMachine, label);
        await inputDiameter.fill("0");
        await formMachine.getByTestId("button-submit").click();
        await expect(formMachine.getByTestId("button-submit")).toBeDisabled();
        await expect(toasts).toHaveCount(0);
        expect(await getMachineById(machine.id)).toMatchObject({ maxDiameter: null, minDiameter: null });
        await inputDiameter.clear();
      }
    });
  }
});

test("show the machine as it is in the database when its page is opened again", async ({ page, db }) => {
  // A stale name is replaced right after the form stops loading, so it is read in the same DOM change
  await page.addInitScript(() => {
    const observer = new MutationObserver(() => {
      const loadedForm = document.querySelector("[data-testid='form-machine'][data-loading='false']");
      if (loadedForm === null) return;
      (window as Window & { firstLoadedName?: string }).firstLoadedName = loadedForm.querySelector<HTMLInputElement>(
        "#dialog-create-edit-machine-name",
      )?.value;
      observer.disconnect();
    });
    observer.observe(document, { attributes: true, childList: true, subtree: true });
  });

  for (const machine of activeMachines) {
    const nameInDatabase = `${machine.name} renombrado en otro equipo`;

    await page.goto(`/machine/${machine.id}`);
    await assertFormLoaded(formMachine);
    await expect(getFormInputByLabel(formMachine, NAME_LABEL)).toHaveValue(machine.name);

    // Leaving the page cancels its pending live request, so the change cannot arrive in a response the browser kept
    await page.evaluate(() => {
      window.location.href = "about:blank";
    });
    await page.waitForURL("about:blank");
    await db.update(dbTableMachine).set({ name: nameInDatabase }).where(eq(dbTableMachine.id, machine.id));

    await page.goto(`/machine/${machine.id}`);

    await expect
      .poll(async () => page.evaluate(() => (window as Window & { firstLoadedName?: string }).firstLoadedName))
      .toBe(nameInDatabase);
  }
});

const DELETED_MACHINE_FILTER_PARAMS = {
  url: MAINTENANCE_MACHINE_URL,
  tableTestId: "table-machine",
  filterLabel: SHOW_DELETED_MACHINES_LABEL,
  getDeletedAt: async (id: number) => (await getMachineById(id))?.deletedAt,
};

test("list the deleted machines only when asked for and restore them from the table", async ({ page }) => {
  await workflowDeletedFilterAndRestore({
    ...DELETED_MACHINE_FILTER_PARAMS,
    page,
    ids: activeMachines.map(({ id }) => id),
    // The page of a deleted Máquina shows it read only, with its own restore button
    editButton: EditButtonVisibility.Always,
    restoredToastTitle: MACHINE_RESTORED_MESSAGE,
  });
});

test("a deleted machine cannot be restored from the table while another one has its name", async ({ page, db }) => {
  const machine = activeMachines[0];
  await workflowRestoreTaken({
    ...DELETED_MACHINE_FILTER_PARAMS,
    page,
    id: machine.id,
    insertDuplicate: async () => db.insert(dbTableMachine).values({ name: machine.name }),
    uniqueViolation: uniqueNameViolation(MACHINE_NAME_CONSTRAINT, dbTableMachine, machine.name),
    errorMessage: NAME_TAKEN_MESSAGE,
  });
});
