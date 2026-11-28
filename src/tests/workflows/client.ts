import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import db from "@/db";
import { getClientById } from "@/db/functions/client";
import { CLIENT_DELETED_MESSAGE, CLIENT_DELETE_TITLE } from "@/messages/client";
import type { TBaseModel } from "@/schemas";
import { mockClients, mockDeliveryMethods, mockPaymentMethods } from "@/tests/mock-data";
import { openAndConfirmAlertDialog } from "@/tests/utils/components/alert-dialog";
import { assertComboboxValue } from "@/tests/utils/components/combobox";
import { InputElementType, assertFormLoaded, getFormInputByLabel } from "@/tests/utils/components/form";
import { filterByExactText, findTableRow, getTableRowByTestId } from "@/tests/utils/components/table";
import { expectSingleSuccessToast } from "@/tests/utils/components/toast";
import { CLIENT_FIELD_LABELS, CLIENT_SPLIT_SELL_ORDERS_CHECKBOX_ID } from "@/types/client";
import type { BaseClient } from "@/types/client";

async function assertModelComboboxValue(
  formClient: Locator,
  label: string,
  expectedId: number | null,
  models: Array<TBaseModel & { name: string }>,
) {
  const combobox = getFormInputByLabel(formClient, label, InputElementType.Combobox);
  await expect(combobox).toBeVisible();
  await assertComboboxValue(combobox, expectedId === null ? null : String(expectedId));
  if (expectedId !== null) {
    const model = models.find((mockModel) => mockModel.id === expectedId);
    expect(model, "Wrong test set up values").toBeDefined();
    await expect(combobox).toHaveText(model!.name);
  }
}

export async function workflowAssertClientFormData(formClient: Locator, client: BaseClient) {
  await expect(formClient).toBeVisible();
  await assertFormLoaded(formClient);

  const {
    defaultPaymentMethodId: paymentMethodLabel,
    defaultDeliveryMethodId: deliveryMethodLabel,
    splitSellOrdersInDeliveryNotes: _splitSellOrdersLabel,
    ...textFieldLabels
  } = CLIENT_FIELD_LABELS;

  for (const [field, label] of Object.entries(textFieldLabels)) {
    const input = formClient.getByRole("textbox", { name: label, exact: true });
    await expect(input, `Field "${label}"`).toBeVisible();
    await expect(input, `Field "${label}"`).toHaveValue(client[field as keyof typeof textFieldLabels] ?? "");
  }

  await assertModelComboboxValue(formClient, paymentMethodLabel, client.defaultPaymentMethodId, mockPaymentMethods);
  await assertModelComboboxValue(formClient, deliveryMethodLabel, client.defaultDeliveryMethodId, mockDeliveryMethods);
  await expect(formClient.getByTestId(CLIENT_SPLIT_SELL_ORDERS_CHECKBOX_ID)).toBeChecked({
    checked: client.splitSellOrdersInDeliveryNotes,
  });

  const buttonDeleteClient = formClient.getByRole("button", { name: CLIENT_DELETE_TITLE });
  const buttonRestoreClient = formClient.getByTestId("button-restore");
  if (client.deletedAt === null) {
    await expect(buttonDeleteClient).toBeEnabled();
    await expect(buttonRestoreClient).not.toBeAttached();
  } else {
    await expect(buttonDeleteClient).toBeDisabled();
    await expect(buttonRestoreClient).toBeEnabled();
  }
}

export async function workflowDeleteClient(page: Page, client: BaseClient) {
  const tableClient = page.getByTestId("table-client");
  const rowClient = getTableRowByTestId(tableClient, client.id);
  await page.goto("/maintenance");
  await findTableRow(tableClient, rowClient);
  await expect(filterByExactText(rowClient, client.name)).toBeVisible();
  await openAndConfirmAlertDialog(page, rowClient.getByTestId("button-delete"), "dialog-delete-model-content");
  await expect(rowClient).toHaveCount(0);
  await expectSingleSuccessToast(page, CLIENT_DELETED_MESSAGE);
  expect((await getClientById(client.id))?.deletedAt).toBeInstanceOf(Date);
}

// Deleting a Transporte or a Forma de pago clears it as the default of its Clientes, the deleted ones included
export async function assertDeletedDefaultsCleared(
  page: Page,
  field: "defaultDeliveryMethodId" | "defaultPaymentMethodId",
  label: string,
  deletedIds: Set<number>,
  deletedId: number,
) {
  const isCleared = (id: number | null) => id !== null && deletedIds.has(id);
  expect(
    (await db.query.dbTableClient.findMany({ orderBy: { id: "asc" } })).map((client) => ({
      id: client.id,
      [field]: client[field],
    })),
  ).toEqual(mockClients.map((client) => ({ id: client.id, [field]: isCleared(client[field]) ? null : client[field] })));

  const formClient = page.getByTestId("form-client");
  for (const client of mockClients.filter(
    (mockClient) => mockClient.deletedAt === null && mockClient[field] === deletedId,
  )) {
    await page.goto(`/client/${client.id}`);
    await assertFormLoaded(formClient);
    await assertComboboxValue(getFormInputByLabel(formClient, label, InputElementType.Combobox), null);
  }
}
