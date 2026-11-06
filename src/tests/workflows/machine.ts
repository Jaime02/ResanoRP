import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

import { getMachineById } from "@/db/functions/machine";
import { NAME_LABEL } from "@/messages/common";
import { openAndConfirmAlertDialog } from "@/tests/utils/components/alert-dialog";
import { assertFormLoaded, getFormInputByLabel } from "@/tests/utils/components/form";
import { findTableRowByText } from "@/tests/utils/components/table";
import { getToastType, getToasts } from "@/tests/utils/components/toast";
import { ToastType } from "@/types";

export async function workflowCreateMachine(page: Page, machineId: number, machineName: string) {
  const tableMaintenanceMachine = page.getByTestId("table-machine");
  const dialogCreateMachine = page.getByTestId("dialog-create-machine");

  await page.goto("/maintenance?tab=machine");

  expect(await getMachineById(machineId)).toBeUndefined();

  await page.getByRole("button", { name: "Crear Máquina" }).click();

  await expect(page).toHaveURL("/maintenance?tab=machine&createMachine=true");
  await expect(dialogCreateMachine).toBeVisible();

  await getFormInputByLabel(dialogCreateMachine, NAME_LABEL).fill(machineName);
  await dialogCreateMachine.getByTestId("button-submit").click();

  await expect(dialogCreateMachine).not.toBeVisible();
  await expect(tableMaintenanceMachine.getByText(machineName, { exact: true })).toBeVisible();

  const dbMachine = await getMachineById(machineId);
  expect(dbMachine).toBeDefined();
  expect(dbMachine!.name).toBe(machineName);
}

export async function workflowEditMachine(page: Page, machineId: number, currentName: string, updatedName: string) {
  const tableMaintenanceMachine = page.getByTestId("table-machine");
  const formMachine = page.getByTestId("form-machine");
  const toasts = getToasts(page);

  await page.goto("/maintenance?tab=machine");

  await (await findTableRowByText(tableMaintenanceMachine, currentName)).getByTestId("button-edit").click();

  await expect(page).toHaveURL(`/machine/${machineId}`);
  await expect(formMachine).toBeVisible();
  await assertFormLoaded(formMachine);

  await formMachine.locator(`input[value="${currentName}"]`).fill(updatedName);
  await formMachine.getByTestId("button-submit").click();

  await expect(toasts).toHaveCount(1);
  expect(await getToastType(toasts.first())).toBe(ToastType.Success);

  const dbMachine = await getMachineById(machineId);
  expect(dbMachine).toBeDefined();
  expect(dbMachine!.name).toBe(updatedName);
}

export async function workflowDeleteMachine(page: Page, machineId: number, machineName: string) {
  const tableMaintenanceMachine = page.getByTestId("table-machine");

  await page.goto("/maintenance?tab=machine");

  await expect(tableMaintenanceMachine.getByText(machineName, { exact: true })).toBeVisible();

  const existingMachine = await getMachineById(machineId);
  expect(existingMachine).toBeDefined();
  expect(existingMachine!.deletedAt).toBeNull();

  await openAndConfirmAlertDialog(
    page,
    (await findTableRowByText(tableMaintenanceMachine, machineName)).getByTestId("button-delete"),
    "dialog-delete-model-content",
  );

  await expect(tableMaintenanceMachine.getByText(machineName, { exact: true })).not.toBeVisible();

  const deletedMachine = await getMachineById(machineId);
  expect(deletedMachine).toBeDefined();
  expect(deletedMachine!.deletedAt).not.toBeNull();
}
