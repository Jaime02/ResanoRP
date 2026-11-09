import { expect } from "@playwright/test";
import { eq } from "drizzle-orm";

import { PAYMENT_METHOD_NAME_CONSTRAINT, dbTablePaymentMethod } from "@/db/schema";
import { DEFAULT_PAYMENT_METHOD_LABEL } from "@/messages/client";
import { NAME_LABEL, PAYMENT_METHOD_LABEL } from "@/messages/common";
import {
  PAYMENT_METHOD_CREATE_TITLE,
  PAYMENT_METHOD_RESTORED_MESSAGE,
  SHOW_DELETED_PAYMENT_METHODS_LABEL,
  PAYMENT_METHOD_DUE_DAYS_LABEL,
} from "@/messages/payment-method";
import { mockClients, mockInvoices, mockPaymentMethods, mockSellOrders } from "@/tests/mock-data";
import { openAndConfirmAlertDialog } from "@/tests/utils/components/alert-dialog";
import { assertComboboxValue, fillComboboxFilter, openCombobox } from "@/tests/utils/components/combobox";
import { InputElementType, assertFormLoaded, getFormInputByLabel } from "@/tests/utils/components/form";
import { filterByExactText, findTableRowByText, getTableRows } from "@/tests/utils/components/table";
import { expectSingleToast } from "@/tests/utils/components/toast";
import { uniqueNameViolation } from "@/tests/utils/errors-log";
import { test } from "@/tests/utils/fixtures";
import {
  EditButtonVisibility,
  workflowDeletedFilterAndRestore,
  workflowRestoreTaken,
} from "@/tests/workflows/deleted-filter";
import {
  workflowRejectCreateWithTakenName,
  workflowRejectRenameToTakenName,
  workflowReuseDeletedName,
} from "@/tests/workflows/unique-name";
import type { BaseClient } from "@/types/client";

const MAINTENANCE_PAYMENT_METHOD_URL = "/maintenance?tab=paymentMethod";
const NAME_TAKEN_MESSAGE = "Existe una Forma de pago con el mismo nombre";

test("manage the Formas de pago", async ({ page, db }) => {
  const activePaymentMethods = mockPaymentMethods.filter((paymentMethod) => paymentMethod.deletedAt === null);
  const tablePaymentMethod = page.getByTestId("table-payment-method");
  const dialogCreateEditPaymentMethod = page.getByTestId("dialog-create-edit-payment-method");
  const openCreatePaymentMethod = async () => {
    await page.getByRole("button", { name: PAYMENT_METHOD_CREATE_TITLE }).click();
    await expect(dialogCreateEditPaymentMethod).toBeVisible();
  };
  const closeDialog = async () => {
    await dialogCreateEditPaymentMethod.getByTestId("button-close").click();
    await expect(dialogCreateEditPaymentMethod).not.toBeVisible();
  };
  const checkboxGeneratesReceipt = dialogCreateEditPaymentMethod.getByTestId(
    "dialog-create-edit-payment-method-generates-receipt",
  );

  await test.step("create and edit whether a Forma de pago generates receipts", async () => {
    expect(
      [true, false].every((generatesReceipt) =>
        activePaymentMethods.some((paymentMethod) => paymentMethod.generatesReceipt === generatesReceipt),
      ),
      "Wrong test set up: Some Formas de pago should generate receipts and some should not",
    ).toBe(true);

    await page.goto(MAINTENANCE_PAYMENT_METHOD_URL);

    for (const paymentMethod of activePaymentMethods) {
      const checkbox = (await findTableRowByText(tablePaymentMethod, paymentMethod.name)).getByTestId(
        "checkbox-generates-receipt",
      );
      await (paymentMethod.generatesReceipt ? expect(checkbox).toBeChecked() : expect(checkbox).not.toBeChecked());
    }

    // A new Forma de pago does not generate receipts unless it is checked
    const newPaymentMethodName = "Giro a 60 días";
    await page.getByRole("button", { name: PAYMENT_METHOD_CREATE_TITLE }).click();
    await expect(dialogCreateEditPaymentMethod).toBeVisible();
    await expect(checkboxGeneratesReceipt).not.toBeChecked();
    await getFormInputByLabel(dialogCreateEditPaymentMethod, NAME_LABEL).fill(newPaymentMethodName);
    await checkboxGeneratesReceipt.click();
    await expect(checkboxGeneratesReceipt).toBeChecked();
    await dialogCreateEditPaymentMethod.getByTestId("button-submit").click();

    await expect(dialogCreateEditPaymentMethod).not.toBeVisible();
    await expectSingleToast(page);

    const newPaymentMethod = await db.query.dbTablePaymentMethod.findFirst({ where: { name: newPaymentMethodName } });
    expect(newPaymentMethod?.generatesReceipt).toBe(true);
    await expect(
      (await findTableRowByText(tablePaymentMethod, newPaymentMethodName)).getByTestId("checkbox-generates-receipt"),
    ).toBeChecked();

    // Editing them keeps every field, not only the name
    for (const [index, paymentMethod] of activePaymentMethods.entries()) {
      const paymentDeadlineDays = 60 + index;
      await (await findTableRowByText(tablePaymentMethod, paymentMethod.name)).getByTestId("button-edit").click();
      await expect(dialogCreateEditPaymentMethod).toBeVisible();
      await assertFormLoaded(dialogCreateEditPaymentMethod);
      const inputPaymentDeadlineDays = getFormInputByLabel(
        dialogCreateEditPaymentMethod,
        PAYMENT_METHOD_DUE_DAYS_LABEL,
      );
      await expect(getFormInputByLabel(dialogCreateEditPaymentMethod, NAME_LABEL)).toHaveValue(paymentMethod.name);
      await expect(inputPaymentDeadlineDays).toHaveValue(
        paymentMethod.paymentDeadlineDays === null ? "" : `${paymentMethod.paymentDeadlineDays} días`,
      );
      await (paymentMethod.generatesReceipt
        ? expect(checkboxGeneratesReceipt).toBeChecked()
        : expect(checkboxGeneratesReceipt).not.toBeChecked());
      await checkboxGeneratesReceipt.click();
      await inputPaymentDeadlineDays.fill(String(paymentDeadlineDays));
      await expect(inputPaymentDeadlineDays).toHaveValue(`${paymentDeadlineDays} días`);
      await expect(checkboxGeneratesReceipt).toBeChecked({ checked: !paymentMethod.generatesReceipt });
      await dialogCreateEditPaymentMethod.getByTestId("button-submit").click();

      await expect(dialogCreateEditPaymentMethod).not.toBeVisible();
      await expectSingleToast(page);

      expect(await db.query.dbTablePaymentMethod.findFirst({ where: { id: paymentMethod.id } })).toEqual({
        ...paymentMethod,
        generatesReceipt: !paymentMethod.generatesReceipt,
        paymentDeadlineDays,
      });
      const checkbox = (await findTableRowByText(tablePaymentMethod, paymentMethod.name)).getByTestId(
        "checkbox-generates-receipt",
      );
      await (paymentMethod.generatesReceipt ? expect(checkbox).not.toBeChecked() : expect(checkbox).toBeChecked());
    }
  });

  await test.step("reject a Forma de pago with the name of any active one", async () => {
    await page.goto(MAINTENANCE_PAYMENT_METHOD_URL);

    await workflowRejectCreateWithTakenName({
      page,
      items: activePaymentMethods,
      form: dialogCreateEditPaymentMethod,
      openCreate: openCreatePaymentMethod,
      closeCreate: closeDialog,
      insertDuplicate: async (name) => db.insert(dbTablePaymentMethod).values({ name }),
      constraintName: PAYMENT_METHOD_NAME_CONSTRAINT,
      table: dbTablePaymentMethod,
      errorMessage: NAME_TAKEN_MESSAGE,
    });

    await workflowRejectRenameToTakenName({
      page,
      items: activePaymentMethods,
      form: dialogCreateEditPaymentMethod,
      openEdit: async (paymentMethod) =>
        (await findTableRowByText(tablePaymentMethod, paymentMethod.name)).getByTestId("button-edit").click(),
      closeEdit: closeDialog,
      getName: async (id) => (await db.query.dbTablePaymentMethod.findFirst({ where: { id } }))?.name,
      table: dbTablePaymentMethod,
      constraintName: PAYMENT_METHOD_NAME_CONSTRAINT,
      errorMessage: NAME_TAKEN_MESSAGE,
    });
  });

  await test.step("deleting every Forma de pago frees its name and clears it as the default of its Clientes, but keeps it where it was used", async () => {
    expect(
      activePaymentMethods.some((paymentMethod) =>
        mockClients.some((client) => client.defaultPaymentMethodId === paymentMethod.id),
      ),
      "Wrong test set up: Some Cliente should have a default Forma de pago",
    ).toBe(true);
    expect(
      activePaymentMethods.some(
        (paymentMethod) =>
          mockSellOrders.some((sellOrder) => sellOrder.paymentMethodId === paymentMethod.id) &&
          mockInvoices.some((invoice) => invoice.paymentMethodId === paymentMethod.id),
      ),
      "Wrong test set up: Some Forma de pago should be used by Pedidos de venta and Facturas",
    ).toBe(true);

    const deletedPaymentMethodIds = new Set<number>();
    const getExpectedDefaultPaymentMethodId = (client: BaseClient) =>
      client.defaultPaymentMethodId !== null && deletedPaymentMethodIds.has(client.defaultPaymentMethodId)
        ? null
        : client.defaultPaymentMethodId;
    const formClient = page.getByTestId("form-client");
    const formSellOrder = page.getByTestId("form-sell-order");

    for (const paymentMethod of activePaymentMethods) {
      await page.goto(MAINTENANCE_PAYMENT_METHOD_URL);
      await openAndConfirmAlertDialog(
        page,
        (await findTableRowByText(tablePaymentMethod, paymentMethod.name)).getByTestId("button-delete"),
        "dialog-delete-model-content",
      );
      await expectSingleToast(page);
      deletedPaymentMethodIds.add(paymentMethod.id);

      await expect(filterByExactText(getTableRows(tablePaymentMethod), paymentMethod.name)).toHaveCount(0);
      for (const otherPaymentMethod of activePaymentMethods.filter(
        (activePaymentMethod) => !deletedPaymentMethodIds.has(activePaymentMethod.id),
      )) {
        await expect(filterByExactText(getTableRows(tablePaymentMethod), otherPaymentMethod.name)).toHaveCount(1);
      }

      expect(
        (await db.query.dbTablePaymentMethod.findFirst({ where: { id: paymentMethod.id } }))?.deletedAt,
      ).toBeInstanceOf(Date);
      expect(
        await db.query.dbTableClient.findMany({
          columns: { defaultPaymentMethodId: true, id: true },
          orderBy: { id: "asc" },
        }),
      ).toEqual(
        mockClients.map((client) => ({
          defaultPaymentMethodId: getExpectedDefaultPaymentMethodId(client),
          id: client.id,
        })),
      );
      expect(
        await db.query.dbTableSellOrder.findMany({
          columns: { id: true, paymentMethodId: true },
          orderBy: { id: "asc" },
        }),
      ).toEqual(mockSellOrders.map(({ id, paymentMethodId }) => ({ id, paymentMethodId })));
      expect(
        await db.query.dbTableInvoice.findMany({
          columns: { id: true, paymentMethodId: true },
          orderBy: { id: "asc" },
        }),
      ).toEqual(mockInvoices.map(({ id, paymentMethodId }) => ({ id, paymentMethodId })));

      for (const client of mockClients.filter(
        (mockClient) => mockClient.deletedAt === null && mockClient.defaultPaymentMethodId === paymentMethod.id,
      )) {
        await page.goto(`/client/${client.id}`);
        await assertFormLoaded(formClient);
        await assertComboboxValue(
          getFormInputByLabel(formClient, DEFAULT_PAYMENT_METHOD_LABEL, InputElementType.Combobox),
          null,
        );
      }

      // The deleted Forma de pago is still shown in its Pedidos de venta, although it can no longer be picked
      for (const sellOrder of mockSellOrders.filter(
        (mockSellOrder) => mockSellOrder.deletedAt === null && mockSellOrder.paymentMethodId === paymentMethod.id,
      )) {
        await page.goto(`/sell-order/${sellOrder.id}`);
        await assertFormLoaded(formSellOrder);
        const comboboxPaymentMethod = getFormInputByLabel(
          formSellOrder,
          PAYMENT_METHOD_LABEL,
          InputElementType.Combobox,
        );
        await assertComboboxValue(comboboxPaymentMethod, String(paymentMethod.id));
        await expect(comboboxPaymentMethod.getByTestId("button-trigger")).toHaveText(paymentMethod.name);

        await openCombobox(comboboxPaymentMethod);
        await fillComboboxFilter(page, paymentMethod.name);
        await expect(page.getByTestId("combobox-list").locator("[role='option']")).toHaveCount(0);
      }

      // Its name can be used again, so the deleted Forma de pago can no longer be restored
      await page.goto(MAINTENANCE_PAYMENT_METHOD_URL);
      await workflowReuseDeletedName({
        page,
        item: paymentMethod,
        form: dialogCreateEditPaymentMethod,
        openCreate: openCreatePaymentMethod,
        restoreDeleted: async () =>
          db.update(dbTablePaymentMethod).set({ deletedAt: null }).where(eq(dbTablePaymentMethod.id, paymentMethod.id)),
        constraintName: PAYMENT_METHOD_NAME_CONSTRAINT,
      });
      await expect(filterByExactText(getTableRows(tablePaymentMethod), paymentMethod.name)).toHaveCount(1);
    }
  });
});

const DELETED_PAYMENT_METHOD_FILTER_PARAMS = {
  url: MAINTENANCE_PAYMENT_METHOD_URL,
  tableTestId: "table-payment-method",
  filterLabel: SHOW_DELETED_PAYMENT_METHODS_LABEL,
};

test("list the deleted Formas de pago only when asked for and restore them from the table", async ({ page, db }) => {
  await workflowDeletedFilterAndRestore({
    ...DELETED_PAYMENT_METHOD_FILTER_PARAMS,
    page,
    getDeletedAt: async (id) => (await db.query.dbTablePaymentMethod.findFirst({ where: { id } }))?.deletedAt,
    ids: mockPaymentMethods.filter((paymentMethod) => paymentMethod.deletedAt === null).map(({ id }) => id),
    editButton: EditButtonVisibility.OnlyActive,
    restoredToastTitle: PAYMENT_METHOD_RESTORED_MESSAGE,
  });
});

test("a deleted Forma de pago cannot be restored from the table while another one has its name", async ({
  page,
  db,
}) => {
  const paymentMethod = mockPaymentMethods.find((mockPaymentMethod) => mockPaymentMethod.deletedAt === null)!;
  await workflowRestoreTaken({
    ...DELETED_PAYMENT_METHOD_FILTER_PARAMS,
    page,
    getDeletedAt: async (id) => (await db.query.dbTablePaymentMethod.findFirst({ where: { id } }))?.deletedAt,
    id: paymentMethod.id,
    insertDuplicate: async () => db.insert(dbTablePaymentMethod).values({ name: paymentMethod.name }),
    uniqueViolation: uniqueNameViolation(PAYMENT_METHOD_NAME_CONSTRAINT, dbTablePaymentMethod, paymentMethod.name),
    errorMessage: NAME_TAKEN_MESSAGE,
  });
});
