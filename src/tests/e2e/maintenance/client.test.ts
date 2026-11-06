import { expect } from "@playwright/test";
import type { Locator } from "@playwright/test";
import { eq } from "drizzle-orm";

import { getClientById } from "@/db/functions/client";
import {
  CLIENT_INVOICE_EMAIL_CONSTRAINT,
  CLIENT_NAME_CONSTRAINT,
  dbTableClient,
  dbTableClientInvoiceEmail,
} from "@/db/schema";
import {
  DEFAULT_DELIVERY_METHOD_LABEL,
  DEFAULT_PAYMENT_METHOD_LABEL,
  PHONE_LABEL,
  PRISMA_ACCOUNTING_ACCOUNT_LABEL,
} from "@/messages/client";
import {
  ADDRESS_LABEL,
  CITY_LABEL,
  CLIENT_LABEL,
  LEGAL_NAME_LABEL,
  NAME_LABEL,
  POSTAL_CODE_LABEL,
  TAX_ID_LABEL,
} from "@/messages/common";
import { SellOrderStatus } from "@/schemas/sell-order";
import {
  mockClientInvoiceEmails,
  mockClients,
  mockDeliveryMethods,
  mockDeliveryNotes,
  mockInvoices,
  mockPartPrices,
  mockPartReferences,
  mockParts,
  mockPaymentMethods,
  mockSellOrders,
} from "@/tests/mock-data";
import { openAndConfirmAlertDialog } from "@/tests/utils/components/alert-dialog";
import {
  assertComboboxOptionsCount,
  assertComboboxValue,
  clickInComboboxOption,
  fillComboboxFilter,
  getClearComboboxButton,
  openCombobox,
  selectComboboxOption,
} from "@/tests/utils/components/combobox";
import { InputElementType, assertFormLoaded, getFormInputByLabel } from "@/tests/utils/components/form";
import {
  assertTableRowCount,
  filterByExactText,
  findTableRowByText,
  getTableNoDataRow,
  getTableRowByTestId,
  getTableRows,
} from "@/tests/utils/components/table";
import { clearToasts, getToastType } from "@/tests/utils/components/toast";
import { expectUniqueViolation } from "@/tests/utils/db";
import { TestAnnotations, inAnotherTab, test } from "@/tests/utils/fixtures";
import { getMockPartReferenceById, getMockSellOrderLines } from "@/tests/utils/mock-data-utils";
import { holdRequestWhile } from "@/tests/utils/trpc";
import { workflowAssertClientFormData, workflowDeleteClient } from "@/tests/workflows/client";
import {
  EditButtonVisibility,
  workflowDeletedFilterAndRestore,
  workflowRestoreTaken,
} from "@/tests/workflows/deleted-filter";
import { ToastType } from "@/types";
import type { BaseClient } from "@/types/client";

const activeClients = mockClients.filter((client) => client.deletedAt === null);
const activeDeliveryMethods = mockDeliveryMethods.filter((deliveryMethod) => deliveryMethod.deletedAt === null);
const activePaymentMethods = mockPaymentMethods.filter((paymentMethod) => paymentMethod.deletedAt === null);
const NEW_CLIENT_ID = Math.max(...mockClients.map((client) => client.id)) + 1;

let tableMaintenanceClient: Locator;
let dialogCreateClient: Locator;
let formClient: Locator;

test.beforeEach(({ page }) => {
  tableMaintenanceClient = page.getByTestId("table-client");
  dialogCreateClient = page.getByTestId("dialog-create-client");
  formClient = page.getByTestId("form-client");
});

async function fillRequiredClientFields(
  form: Locator,
  client: Pick<BaseClient, "name" | "legalName" | "address" | "city" | "postalCode" | "taxId">,
) {
  await getFormInputByLabel(form, NAME_LABEL).fill(client.name);
  await getFormInputByLabel(form, LEGAL_NAME_LABEL).fill(client.legalName);
  await getFormInputByLabel(form, ADDRESS_LABEL).fill(client.address);
  await getFormInputByLabel(form, CITY_LABEL).fill(client.city);
  await getFormInputByLabel(form, POSTAL_CODE_LABEL).fill(client.postalCode);
  await getFormInputByLabel(form, TAX_ID_LABEL).fill(client.taxId);
}

function getClientRows(name: string): Locator {
  return filterByExactText(getTableRows(tableMaintenanceClient), name);
}

// A read only Cliente lists its invoice emails, but they cannot be added nor removed
async function assertInvoiceEmailsCard({ isReadOnly, emails }: { isReadOnly: boolean; emails: Array<string> }) {
  const cardInvoiceEmails = formClient.getByTestId("card-table-client-invoice-email");
  await expect(cardInvoiceEmails).toBeVisible();
  await expect(cardInvoiceEmails.getByTestId("input-add-invoice-email")).toHaveCount(isReadOnly ? 0 : 1);
  await expect(cardInvoiceEmails.getByTestId("button-add-invoice-email")).toHaveCount(isReadOnly ? 0 : 1);
  await expect(cardInvoiceEmails.getByTestId("tr-no-data")).toHaveCount(emails.length === 0 ? 1 : 0);
  for (const email of emails) {
    await expect(cardInvoiceEmails.getByText(email, { exact: true })).toBeVisible();
  }
  await expect(cardInvoiceEmails.getByTestId("button-delete")).toHaveCount(isReadOnly ? 0 : emails.length);
}

test("set and remove the default delivery method of every client", async ({ page, toasts }) => {
  for (const client of activeClients) {
    await page.goto(`/client/${client.id}`);
    await workflowAssertClientFormData(formClient, client);
    const comboboxDeliveryMethod = getFormInputByLabel(
      formClient,
      DEFAULT_DELIVERY_METHOD_LABEL,
      InputElementType.Combobox,
    );

    for (const deliveryMethod of activeDeliveryMethods) {
      await clearToasts(page);
      await selectComboboxOption(page, comboboxDeliveryMethod, deliveryMethod.name);

      // Picking the default it already has leaves nothing to save
      if ((await getClientById(client.id))?.defaultDeliveryMethodId === deliveryMethod.id) {
        await expect(formClient.getByTestId("button-submit")).toBeDisabled();
        continue;
      }
      await formClient.getByTestId("button-submit").click();

      await expect(toasts).toHaveCount(1);
      expect(await getToastType(toasts.first())).toBe(ToastType.Success);
      expect((await getClientById(client.id))?.defaultDeliveryMethodId).toBe(deliveryMethod.id);
      await page.reload();
      await workflowAssertClientFormData(formClient, { ...client, defaultDeliveryMethodId: deliveryMethod.id });
    }

    await clearToasts(page);
    await getClearComboboxButton(comboboxDeliveryMethod).click();
    await formClient.getByTestId("button-submit").click();

    await expect(toasts).toHaveCount(1);
    expect(await getToastType(toasts.first())).toBe(ToastType.Success);
    expect((await getClientById(client.id))?.defaultDeliveryMethodId).toBeNull();
    await page.reload();
    await workflowAssertClientFormData(formClient, { ...client, defaultDeliveryMethodId: null });
  }
});

test(
  "manage the clients",
  { annotation: [TestAnnotations.ResetSellOrders, TestAnnotations.NonEmptyErrorsLogFile] },
  async ({ page, db, toasts }) => {
    const newClient = {
      address: "Test Address",
      city: "Test City",
      legalName: "New Test Client - Full legal name",
      name: "New Test Client",
      phone: "555123456",
      postalCode: "31000",
      taxId: "X12345678",
    };

    await test.step("render the client form at /client/$id", async () => {
      for (const client of mockClients) {
        await page.goto(`/client/${client.id}`);
        await workflowAssertClientFormData(formClient, client);
      }
    });

    await test.step("render the clients table at /maintenance", async () => {
      await page.goto("/maintenance");

      for (const client of activeClients) {
        await expect(getClientRows(client.name)).toHaveCount(1);
        for (const email of mockClientInvoiceEmails.filter((clientEmail) => clientEmail.clientId === client.id)) {
          await expect(getClientRows(client.name).getByText(email.email, { exact: true })).toBeVisible();
        }
      }
    });

    await test.step("filter clients by name", async () => {
      await page.goto("/maintenance");
      const inputFilterName = tableMaintenanceClient.getByTestId("input-filter-name");

      for (const client of activeClients) {
        await inputFilterName.fill(client.name);

        for (const otherClient of activeClients) {
          await expect(getClientRows(otherClient.name)).toHaveCount(
            otherClient.name.toLowerCase().includes(client.name.toLowerCase()) ? 1 : 0,
          );
        }
      }

      await inputFilterName.fill(`${activeClients[0].name}x`);
      await expect(getTableNoDataRow(tableMaintenanceClient)).toBeVisible();
    });

    await test.step("go back to the clients table from the client route", async () => {
      for (const client of activeClients) {
        await page.goto(`/client/${client.id}`);

        await assertFormLoaded(formClient);
        await formClient.getByRole("button", { name: "Ver Clientes" }).click();

        await expect(page).toHaveURL("/maintenance?tab=client");
        await expect(getClientRows(client.name)).toHaveCount(1);
      }
    });

    await test.step("change and remove the default payment method of every client", async () => {
      const comboboxPaymentMethod = getFormInputByLabel(
        formClient,
        DEFAULT_PAYMENT_METHOD_LABEL,
        InputElementType.Combobox,
      );

      for (const client of activeClients) {
        expect((await getClientById(client.id))?.defaultPaymentMethodId).toBe(client.defaultPaymentMethodId);
        await page.goto("/maintenance");
        await (await findTableRowByText(tableMaintenanceClient, client.name)).getByTestId("button-edit").click();

        await expect(page).toHaveURL(`/client/${client.id}`);
        await assertFormLoaded(formClient);
        await assertComboboxValue(
          comboboxPaymentMethod,
          client.defaultPaymentMethodId === null ? null : String(client.defaultPaymentMethodId),
        );

        for (const paymentMethod of activePaymentMethods) {
          await clearToasts(page);
          await openCombobox(comboboxPaymentMethod);
          await assertComboboxOptionsCount(page, activePaymentMethods.length);
          await fillComboboxFilter(page, paymentMethod.name);
          await assertComboboxOptionsCount(page, 1);
          await clickInComboboxOption(page, paymentMethod.name);
          await expect(getClearComboboxButton(comboboxPaymentMethod)).toBeVisible();

          await formClient.getByTestId("button-submit").click();

          await expect(toasts).toHaveCount(1);
          expect(await getToastType(toasts.first())).toBe(ToastType.Success);
          expect((await getClientById(client.id))?.defaultPaymentMethodId).toBe(paymentMethod.id);

          await page.reload();
          await assertFormLoaded(formClient);
          await expect(comboboxPaymentMethod).toHaveText(paymentMethod.name);
        }

        // Clearing the combobox removes the default payment method
        await clearToasts(page);
        const buttonClearCombobox = getClearComboboxButton(comboboxPaymentMethod);
        await buttonClearCombobox.click();
        await expect(buttonClearCombobox).not.toBeVisible();

        await formClient.getByTestId("button-submit").click();

        await expect(toasts).toHaveCount(1);
        expect(await getToastType(toasts.first())).toBe(ToastType.Success);
        await clearToasts(page);

        await page.reload();
        await assertFormLoaded(formClient);
        await assertComboboxValue(comboboxPaymentMethod, null);
        expect((await getClientById(client.id))?.defaultPaymentMethodId).toBeNull();
      }
    });

    await test.step("add the same invoice email to every client, but only once to each", async () => {
      const newEmail = "newclientemail@test.com";
      const inputAddEmail = formClient.getByTestId("input-add-invoice-email");
      const buttonAddEmail = formClient.getByTestId("button-add-invoice-email");

      for (const [index, client] of activeClients.entries()) {
        await page.goto(`/client/${client.id}`);
        await assertFormLoaded(formClient);

        // An invalid email cannot be added
        await inputAddEmail.fill("invalid-email");
        await expect(buttonAddEmail).toBeDisabled();

        // ...and a Cliente can use an email of another one
        await inputAddEmail.fill(newEmail);
        await buttonAddEmail.click();

        await expect(formClient.getByText(newEmail, { exact: true })).toBeVisible();
        await expect(inputAddEmail).toHaveValue("");
        expect(
          await db.query.dbTableClientInvoiceEmail.findMany({ where: { clientId: client.id, email: newEmail } }),
        ).toHaveLength(1);
        expect(await db.query.dbTableClientInvoiceEmail.findMany({ where: { email: newEmail } })).toHaveLength(
          index + 1,
        );

        // The same Cliente cannot hold the email twice
        await clearToasts(page);
        await inputAddEmail.fill(newEmail);
        await buttonAddEmail.click();

        await expect(toasts).toHaveCount(1);
        expect(await getToastType(toasts.first())).toBe(ToastType.Error);
        await expect(toasts.first()).toContainText("El Cliente ya tiene ese correo");
        await clearToasts(page);

        await expectUniqueViolation(
          db.insert(dbTableClientInvoiceEmail).values({ clientId: client.id, email: newEmail }),
          CLIENT_INVOICE_EMAIL_CONSTRAINT,
        );
      }
    });

    await test.step("keep the unsaved changes of every client while its invoice emails change", async () => {
      const unsavedPhone = "600000000";
      const unsavedEmail = "unsavedemail@test.com";
      const syncedCity = "Synced City";
      const inputPhone = getFormInputByLabel(formClient, PHONE_LABEL);
      const inputAddEmail = formClient.getByTestId("input-add-invoice-email");

      for (const client of activeClients) {
        const syncedEmail = `syncedemail-${client.id}@test.com`;

        await page.goto(`/client/${client.id}`);
        await assertFormLoaded(formClient);
        await inputPhone.fill(unsavedPhone);
        await inputAddEmail.fill(unsavedEmail);

        await db.insert(dbTableClientInvoiceEmail).values({ clientId: client.id, email: syncedEmail });
        await expect(formClient.getByText(syncedEmail, { exact: true })).toBeVisible();
        await expect(inputPhone).toHaveValue(unsavedPhone);
        await expect(inputAddEmail).toHaveValue(unsavedEmail);

        // ...but a change of the Cliente itself reloads the form
        await db.update(dbTableClient).set({ city: syncedCity }).where(eq(dbTableClient.id, client.id));
        await expect(getFormInputByLabel(formClient, CITY_LABEL)).toHaveValue(syncedCity);
        await expect(inputPhone).toHaveValue(client.phone ?? "");
        await expect(inputAddEmail).toHaveValue(unsavedEmail);
      }
    });

    await test.step("update the information of every client", async () => {
      for (const [index, client] of activeClients.entries()) {
        const currentClient = (await getClientById(client.id))!;
        const updatedName = `${client.name} actualizado`;
        const updatedCity = `${client.city} actualizada`;
        const updatedAccountingAccountId = `43099${index}`;

        await page.goto("/maintenance");
        await (await findTableRowByText(tableMaintenanceClient, currentClient.name)).getByTestId("button-edit").click();

        await expect(page).toHaveURL(`/client/${client.id}`);
        await assertFormLoaded(formClient);

        await getFormInputByLabel(formClient, NAME_LABEL).fill(updatedName);
        await getFormInputByLabel(formClient, CITY_LABEL).fill(updatedCity);

        // The account goes into the 430 group and the exported invoices only have room for 9 digits
        const inputAccountingAccountId = getFormInputByLabel(formClient, PRISMA_ACCOUNTING_ACCOUNT_LABEL);
        for (const invalidAccountingAccountId of ["7050001", "4300000001"]) {
          await inputAccountingAccountId.fill(invalidAccountingAccountId);
          await formClient.getByTestId("button-submit").click();
          await expect(formClient.getByText("Debe empezar por 430 y tener como máximo 9 dígitos")).toBeVisible();
          await expect(formClient.getByTestId("button-submit")).toBeDisabled();
        }
        expect(await getClientById(client.id)).toEqual(currentClient);

        await clearToasts(page);
        await inputAccountingAccountId.fill(updatedAccountingAccountId);
        await formClient.getByTestId("button-submit").click();

        await expect(toasts).toHaveCount(1);
        expect(await getToastType(toasts.first())).toBe(ToastType.Success);

        expect(await getClientById(client.id)).toEqual({
          ...currentClient,
          city: updatedCity,
          name: updatedName,
          prismaAccountingAccountId: updatedAccountingAccountId,
        });

        await formClient.getByRole("button", { name: "Ver Clientes" }).click();

        const updatedClientRow = await findTableRowByText(tableMaintenanceClient, updatedName);
        await expect(updatedClientRow.getByText(updatedCity, { exact: true })).toBeVisible();
        await expect(tableMaintenanceClient.getByText(updatedAccountingAccountId)).toHaveCount(0);
        await expect(getClientRows(client.name)).toHaveCount(0);
      }
    });

    await test.step("create a new client", async () => {
      await page.goto("/maintenance");
      await assertTableRowCount(tableMaintenanceClient, activeClients.length);

      await page.getByRole("button", { name: "Crear Cliente" }).click();

      await expect(dialogCreateClient).toBeVisible();
      await expect(page).toHaveURL("/maintenance?createClient=true");

      // The accounting account is only filled in from the route of the Cliente
      await expect(getFormInputByLabel(dialogCreateClient, PRISMA_ACCOUNTING_ACCOUNT_LABEL)).toHaveCount(0);

      await getFormInputByLabel(dialogCreateClient, NAME_LABEL).fill(newClient.name);
      await getFormInputByLabel(dialogCreateClient, LEGAL_NAME_LABEL).fill(newClient.legalName);
      await getFormInputByLabel(dialogCreateClient, CITY_LABEL).fill(newClient.city);
      await getFormInputByLabel(dialogCreateClient, PHONE_LABEL).fill(newClient.phone);

      // The address, postal code and CIF are required to account the invoices of the Cliente
      await dialogCreateClient.getByTestId("button-submit").click();
      await expect(dialogCreateClient.getByTestId("button-submit")).toBeDisabled();
      await expect(dialogCreateClient).toBeVisible();
      expect(await getClientById(NEW_CLIENT_ID)).toBeUndefined();

      await getFormInputByLabel(dialogCreateClient, ADDRESS_LABEL).fill(newClient.address);
      await getFormInputByLabel(dialogCreateClient, POSTAL_CODE_LABEL).fill(newClient.postalCode);
      await getFormInputByLabel(dialogCreateClient, TAX_ID_LABEL).fill(newClient.taxId);

      await dialogCreateClient.getByTestId("button-submit").click();

      await expect(page).toHaveURL(`/client/${NEW_CLIENT_ID}`);
      await assertFormLoaded(formClient);
      await expect(getFormInputByLabel(formClient, NAME_LABEL)).toHaveValue(newClient.name);
      await expect(formClient.getByTestId("card-table-client-invoice-email")).not.toHaveAttribute("inert");

      expect(await getClientById(NEW_CLIENT_ID)).toMatchObject({ ...newClient, prismaAccountingAccountId: null });
      await expect(getFormInputByLabel(formClient, PRISMA_ACCOUNTING_ACCOUNT_LABEL)).toHaveValue("");

      await formClient.getByRole("button", { name: "Ver Clientes" }).click();

      const newClientRow = await findTableRowByText(tableMaintenanceClient, newClient.name);
      await expect(newClientRow.getByText(newClient.city, { exact: true })).toBeVisible();
      await expect(newClientRow.getByText(newClient.phone, { exact: true })).toBeVisible();
    });
  },
);

test("remove every client invoice email", async ({ page, db }) => {
  const removedEmailIds = new Set<number>();

  for (const emailToDelete of mockClientInvoiceEmails) {
    await page.goto(`/client/${emailToDelete.clientId}`);
    await assertFormLoaded(formClient);
    await expect(formClient.getByText(emailToDelete.email, { exact: true })).toBeVisible();

    const emailCard = formClient.locator(`:has(:text("${emailToDelete.email}"))`);
    await openAndConfirmAlertDialog(page, emailCard.getByTestId("button-delete"), "dialog-delete-model-content");
    removedEmailIds.add(emailToDelete.id);

    await expect(formClient.getByText(emailToDelete.email, { exact: true })).not.toBeVisible();
    for (const clientEmail of mockClientInvoiceEmails.filter(
      (email) => email.clientId === emailToDelete.clientId && !removedEmailIds.has(email.id),
    )) {
      await expect(formClient.getByText(clientEmail.email, { exact: true })).toBeVisible();
    }

    expect(await db.query.dbTableClientInvoiceEmail.findMany({ orderBy: { id: "asc" } })).toEqual(
      mockClientInvoiceEmails.filter((email) => !removedEmailIds.has(email.id)),
    );
  }
});

test("delete every client when confirmed and restore it", async ({ page, db }) => {
  expect(
    activeClients.some((client) => mockClientInvoiceEmails.some((email) => email.clientId === client.id)),
    "Wrong test set up: Some Cliente should have invoice emails",
  ).toBe(true);
  const deletedClientIds = new Set<number>();

  for (const client of activeClients) {
    await page.goto("/maintenance");
    expect((await getClientById(client.id))?.deletedAt).toBeNull();

    await openAndConfirmAlertDialog(
      page,
      (await findTableRowByText(tableMaintenanceClient, client.name)).getByTestId("button-delete"),
      "dialog-delete-model-content",
    );
    deletedClientIds.add(client.id);

    await expect(getClientRows(client.name)).toHaveCount(0);
    for (const otherClient of activeClients.filter(({ id }) => !deletedClientIds.has(id))) {
      await expect(getClientRows(otherClient.name)).toHaveCount(1);
    }
    expect((await getClientById(client.id))?.deletedAt).not.toBeNull();

    // Its invoice emails are deleted, the ones of the other Clientes are kept
    expect(await db.query.dbTableClientInvoiceEmail.findMany({ orderBy: { id: "asc" } })).toEqual(
      mockClientInvoiceEmails.filter((email) => !deletedClientIds.has(email.clientId)),
    );

    await page.goto(`/client/${client.id}`);
    await assertFormLoaded(formClient);

    // A deleted client is read only until it is restored
    await expect(formClient.getByTestId("badge-client-deleted")).toBeVisible();
    await expect(formClient.getByTestId("button-submit")).toHaveCount(0);
    await assertInvoiceEmailsCard({ isReadOnly: true, emails: [] });

    await openAndConfirmAlertDialog(page, formClient.getByTestId("button-restore"), "dialog-restore-model-content");

    await expect(formClient.getByTestId("badge-client-deleted")).not.toBeVisible();
    await expect(formClient.getByTestId("button-submit")).toBeVisible();
    expect((await getClientById(client.id))?.deletedAt).toBeNull();

    // Restoring the Cliente does not bring its invoice emails back, but new ones can be added again
    expect(await db.query.dbTableClientInvoiceEmail.findMany({ where: { clientId: client.id } })).toHaveLength(0);
    await assertInvoiceEmailsCard({ isReadOnly: false, emails: [] });
  }
});

test(
  "no invoice email can be added to a client deleted in another tab meanwhile",
  { annotation: TestAnnotations.NonEmptyErrorsLogFile },
  async ({ page, db, toasts }) => {
    for (const client of activeClients) {
      await page.goto(`/client/${client.id}`);
      await assertFormLoaded(formClient);
      await formClient.getByTestId("input-add-invoice-email").fill(`deleted-client-${client.id}@example.com`);

      await holdRequestWhile({
        page,
        procedurePath: "clientInvoiceEmail.create",
        send: async () => formClient.getByTestId("button-add-invoice-email").click(),
        meanwhile: async () => inAnotherTab(page, async (anotherPage) => workflowDeleteClient(anotherPage, client)),
      });

      await expect(toasts).toHaveCount(1);
      expect(await getToastType(toasts.first())).toBe(ToastType.Error);
      await expect(toasts.first()).toContainText("No se pueden añadir correos de facturación a un Cliente eliminado");
      await clearToasts(page);

      await assertInvoiceEmailsCard({ isReadOnly: true, emails: [] });
      expect(await db.query.dbTableClientInvoiceEmail.findMany({ where: { clientId: client.id } })).toHaveLength(0);
    }
  },
);

test(
  "a user sees the invoice emails of every client read only",
  { annotation: TestAnnotations.UserModeUser },
  async ({ page }) => {
    expect(
      activeClients.some((client) => mockClientInvoiceEmails.some((email) => email.clientId === client.id)),
      "Wrong test set up: Some Cliente should have invoice emails",
    ).toBe(true);

    for (const client of activeClients) {
      await page.goto(`/client/${client.id}`);
      await assertFormLoaded(formClient);
      await expect(formClient.getByTestId("button-submit")).toHaveCount(0);
      await assertInvoiceEmailsCard({
        isReadOnly: true,
        emails: mockClientInvoiceEmails.filter((email) => email.clientId === client.id).map(({ email }) => email),
      });
    }
  },
);

const DELETED_CLIENT_FILTER_PARAMS = {
  url: "/maintenance",
  tableTestId: "table-client",
  filterLabel: "Ver Clientes eliminados",
  getDeletedAt: async (id: number) => (await getClientById(id))?.deletedAt,
};

test("list the deleted clients only when asked for and restore them from the table", async ({ page }) => {
  await workflowDeletedFilterAndRestore({
    ...DELETED_CLIENT_FILTER_PARAMS,
    page,
    ids: activeClients.map(({ id }) => id),
    // The page of a deleted Cliente shows it read only, with its own restore button
    editButton: EditButtonVisibility.Always,
    restoredToastTitle: "Cliente restaurado",
  });
});

test(
  "a deleted client cannot be restored from the table while another one has its name",
  { annotation: TestAnnotations.NonEmptyErrorsLogFile },
  async ({ page, db }) => {
    const client = activeClients[0];
    await workflowRestoreTaken({
      ...DELETED_CLIENT_FILTER_PARAMS,
      page,
      id: client.id,
      insertDuplicate: async () =>
        db.insert(dbTableClient).values({
          address: client.address,
          city: client.city,
          legalName: client.legalName,
          name: client.name,
          postalCode: client.postalCode,
          taxId: client.taxId,
        }),
      errorMessage: "Existe un Cliente con el mismo nombre",
    });
  },
);

test("a deleted client keeps its history, but its references and prices are hidden", async ({ page }) => {
  expect(
    mockParts.some((part) =>
      activeClients.every(
        (client) =>
          mockPartReferences.some(
            (partReference) =>
              partReference.partId === part.id &&
              partReference.clientId === client.id &&
              partReference.deletedAt === null,
          ) && mockPartPrices.some((partPrice) => partPrice.partId === part.id && partPrice.clientId === client.id),
      ),
    ),
    "Wrong test set up: Some Artículo should have References and Prices of every Cliente",
  ).toBe(true);

  const deletedClientIds = new Set(mockClients.filter((client) => client.deletedAt !== null).map(({ id }) => id));
  const isOfDeletedClient = ({ clientId }: { clientId: number | null }) =>
    clientId !== null && deletedClientIds.has(clientId);
  const tableSellOrder = page.getByTestId("table-sell-order");
  const formSellOrder = page.getByTestId("form-sell-order");
  const formPart = page.getByTestId("form-part");
  const clientDeletedState = { filters: [{ id: "statuses", value: [SellOrderStatus.ClientDeleted] }] };

  for (const client of activeClients) {
    await workflowDeleteClient(page, client);
    await expect(getClientRows(client.name)).toHaveCount(0);
    deletedClientIds.add(client.id);

    // The Pedidos de venta of the deleted Clientes are kept, but no action can be done on them
    await page.goto("/sell-order");
    for (const sellOrder of mockSellOrders) {
      const cellStatus = getTableRowByTestId(tableSellOrder, sellOrder.id).getByTestId("status");
      if (sellOrder.deletedAt !== null) {
        await expect(cellStatus).toHaveText("Eliminado");
      } else if (isOfDeletedClient(sellOrder)) {
        await expect(cellStatus).toHaveText("Cliente eliminado");
      } else {
        await expect(cellStatus).not.toHaveText("Cliente eliminado");
      }
    }

    const clientDeletedSellOrders = mockSellOrders.filter(
      (sellOrder) => sellOrder.deletedAt === null && isOfDeletedClient(sellOrder),
    );
    await page.goto(`/sell-order?${new URLSearchParams({ "table-sell-order": JSON.stringify(clientDeletedState) })}`);
    await assertTableRowCount(tableSellOrder, clientDeletedSellOrders.length);

    for (const sellOrder of clientDeletedSellOrders.filter(
      (clientDeletedSellOrder) => clientDeletedSellOrder.clientId === client.id,
    )) {
      await page.goto(`/sell-order/${sellOrder.id}`);
      await assertFormLoaded(formSellOrder);
      await expect(formSellOrder.getByTestId("badge-sell-order-status")).toContainText("Cliente eliminado");
      await expect(formSellOrder.getByTestId("button-submit-form-sell-order")).toHaveCount(0);
      const comboboxClient = getFormInputByLabel(formSellOrder, CLIENT_LABEL, InputElementType.Combobox);
      await assertComboboxValue(comboboxClient, String(client.id));
      await expect(comboboxClient.getByTestId("button-trigger")).toHaveText(client.name);

      // Its Lines still show the References of the deleted Cliente
      const tableSellOrderLine = formSellOrder.getByTestId("table-sell-order-line");
      for (const sellOrderLine of getMockSellOrderLines(sellOrder.id)) {
        await expect(getTableRowByTestId(tableSellOrderLine, sellOrderLine.id).getByTestId("part")).toContainText(
          getMockPartReferenceById(sellOrderLine.partReferenceId)!.reference,
        );
      }
    }

    // Its Albaranes and Facturas are kept
    await page.goto("/delivery-note");
    for (const deliveryNote of mockDeliveryNotes.filter(
      (mockDeliveryNote) => mockDeliveryNote.clientId === client.id,
    )) {
      await expect(
        getTableRowByTestId(page.getByTestId("table-delivery-note"), deliveryNote.id).getByTestId("client"),
      ).toHaveText(client.name);
    }
    await page.goto("/invoicing");
    for (const invoice of mockInvoices.filter((mockInvoice) => mockInvoice.clientId === client.id)) {
      await expect(getTableRowByTestId(page.getByTestId("table-invoice"), invoice.id).getByTestId("client")).toHaveText(
        client.name,
      );
    }

    // The References and Prices of the deleted Clientes are hidden
    const activeParts = mockParts.filter((part) => part.deletedAt === null);
    await page.goto("/part");
    for (const part of activeParts) {
      const cellPartReferences = getTableRowByTestId(page.getByTestId("table-part"), part.id).getByTestId("reference");
      for (const partReference of mockPartReferences.filter(
        (mockPartReference) => mockPartReference.partId === part.id && mockPartReference.deletedAt === null,
      )) {
        await (isOfDeletedClient(partReference)
          ? expect(cellPartReferences).not.toContainText(partReference.reference)
          : expect(cellPartReferences).toContainText(partReference.reference));
      }
    }

    // The part form also lists the deleted References, so they can be restored
    for (const part of activeParts) {
      const visiblePartReferences = mockPartReferences.filter(
        (partReference) => partReference.partId === part.id && !isOfDeletedClient(partReference),
      );
      await page.goto(`/part/${part.id}`);
      await assertFormLoaded(formPart);
      const tablePartReferences = formPart.getByTestId("table-part-references");
      await assertTableRowCount(tablePartReferences, visiblePartReferences.length);
      for (const partReference of visiblePartReferences) {
        await expect(getTableRowByTestId(tablePartReferences, partReference.id)).toBeVisible();
      }

      const partPrices = mockPartPrices.filter((partPrice) => partPrice.partId === part.id);
      const visiblePartPrices = partPrices.filter((partPrice) => !isOfDeletedClient(partPrice));
      await page.goto(`/part/${part.id}?tab=prices`);
      await assertFormLoaded(formPart);
      const tablePartPrices = formPart.getByTestId("table-part-prices");
      await assertTableRowCount(tablePartPrices, visiblePartPrices.length);
      for (const partPrice of partPrices) {
        await expect(getTableRowByTestId(tablePartPrices, partPrice.id)).toHaveCount(
          isOfDeletedClient(partPrice) ? 0 : 1,
        );
      }
    }
  }
});

test(
  "keep the name of a Cliente unique while it is not deleted",
  { annotation: [TestAnnotations.ResetSellOrders, TestAnnotations.NonEmptyErrorsLogFile] },
  async ({ page, db, toasts }) => {
    await page.goto("/maintenance");
    for (const client of activeClients) {
      await page.getByRole("button", { name: "Crear Cliente" }).click();
      await expect(dialogCreateClient).toBeVisible();

      await fillRequiredClientFields(dialogCreateClient, client);
      await dialogCreateClient.getByTestId("button-submit").click();

      await expect(toasts).toHaveCount(1);
      expect(await getToastType(toasts.first())).toBe(ToastType.Error);
      await expect(toasts.first()).toContainText("Existe un Cliente con el mismo nombre");
      await expect(dialogCreateClient).toBeVisible();

      await expectUniqueViolation(
        db.insert(dbTableClient).values({
          address: client.address,
          city: client.city,
          legalName: client.legalName,
          name: client.name,
          postalCode: client.postalCode,
          taxId: client.taxId,
        }),
        CLIENT_NAME_CONSTRAINT,
      );

      await clearToasts(page);
      await dialogCreateClient.getByTestId("button-close").click();
      await expect(dialogCreateClient).not.toBeVisible();
    }

    for (const client of activeClients) {
      // Deleting a Cliente frees its name
      await workflowDeleteClient(page, client);
      await expect(getClientRows(client.name)).toHaveCount(0);

      await page.getByRole("button", { name: "Crear Cliente" }).click();
      await expect(dialogCreateClient).toBeVisible();
      await fillRequiredClientFields(dialogCreateClient, client);
      await dialogCreateClient.getByTestId("button-submit").click();

      await expect(dialogCreateClient).not.toBeVisible();
      await assertFormLoaded(formClient);
      await expect(getFormInputByLabel(formClient, NAME_LABEL)).toHaveValue(client.name);

      // ...so the deleted Cliente can no longer be restored
      await page.goto(`/client/${client.id}`);
      await assertFormLoaded(formClient);
      await clearToasts(page);
      await openAndConfirmAlertDialog(page, formClient.getByTestId("button-restore"), "dialog-restore-model-content");

      await expect(toasts).toHaveCount(1);
      expect(await getToastType(toasts.first())).toBe(ToastType.Error);
      await expect(toasts.first()).toContainText("Existe un Cliente con el mismo nombre");

      expect((await getClientById(client.id))?.deletedAt).not.toBeNull();
    }
  },
);
