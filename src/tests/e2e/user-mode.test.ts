import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { eq } from "drizzle-orm";

import { AppContextStorage, UserMode } from "@/contexts/app-context";
import { getInvoiceById } from "@/db/functions/invoice";
import { dbTableClient, dbTableInvoice } from "@/db/schema";
import { ADMIN_SESSION_COOKIE_NAME } from "@/lib/admin-session";
import {
  MOCK_INITIAL_DATE,
  mockDeliveryNoteLines,
  mockDeliveryNotes,
  mockInvoices,
  mockMachines,
  mockPartPrices,
  mockPartProduction,
  mockPartReferences,
  mockParts,
  mockProductionOrders,
  mockSellOrders,
} from "@/tests/mock-data";
import { assertFormLoaded, getFormInputByLabel } from "@/tests/utils/components/form";
import {
  assertTableRowCount,
  getTableNoDataRow,
  getTableRowByTestId,
  getTableRows,
} from "@/tests/utils/components/table";
import { TestAnnotations, inAnotherTab, setUserMode, test } from "@/tests/utils/fixtures";
import {
  getMockClientById,
  getMockPartReferenceById,
  getMockSellOrderById,
  getMockSellOrderLineById,
} from "@/tests/utils/mock-data-utils";
import { holdRequestWhile } from "@/tests/utils/trpc";
import { workflowUnaccountInvoice } from "@/tests/workflows/invoice";

const activeMachines = mockMachines.filter((machine) => machine.deletedAt === null);

async function openLoginDialog(page: Page) {
  await page.goto("/");
  await page.context().clearCookies({ name: AppContextStorage.COOKIE_NAME });
  await page.reload();
  const dialogLogin = page.getByTestId("form-login");
  await expect(dialogLogin).toBeVisible();
  return dialogLogin;
}

test("login with every user mode", { annotation: TestAnnotations.UserModeNull }, async ({ page }) => {
  const spanCurrentUserMode = page.getByTestId("span-current-user-mode");

  await test.step("login as admin", async () => {
    const dialogLogin = await openLoginDialog(page);
    const dialogInputAdminPassword = page.getByTestId("form-admin-password");
    await expect(dialogInputAdminPassword).not.toBeVisible();

    await dialogLogin.getByRole("button", { name: UserMode.Admin }).click();

    await expect(dialogLogin).not.toBeVisible();
    await expect(dialogInputAdminPassword).toBeVisible();

    const inputAdminPassword = getFormInputByLabel(dialogInputAdminPassword, "Introduce la contraseña");
    await expect(inputAdminPassword).toBeVisible();

    expect(process.env.ADMIN_PASSWORD).toBeDefined();
    await inputAdminPassword.fill(process.env.ADMIN_PASSWORD!);
    await expect(inputAdminPassword).toHaveValue(process.env.ADMIN_PASSWORD!);

    await dialogInputAdminPassword.getByTestId("button-submit").click();
    await expect(dialogInputAdminPassword).not.toBeVisible();

    await expect(spanCurrentUserMode).toBeVisible();
    await expect(spanCurrentUserMode).toHaveText(UserMode.Admin);
  });

  await test.step("login as user", async () => {
    const dialogLogin = await openLoginDialog(page);

    await dialogLogin.getByRole("button", { name: UserMode.User }).click();

    await expect(dialogLogin).not.toBeVisible();

    await expect(spanCurrentUserMode).toBeVisible();
    await expect(spanCurrentUserMode).toHaveText(UserMode.User);
  });

  for (const selectedMachine of activeMachines) {
    await test.step(`login as the machine ${selectedMachine.name}`, async () => {
      const dialogLogin = await openLoginDialog(page);

      await dialogLogin.getByRole("button", { name: UserMode.Machine }).click();

      await expect(dialogLogin).not.toBeVisible();

      const dialogMachineSelection = page.getByTestId("form-machine-selection");
      await expect(dialogMachineSelection).toBeVisible();

      await expect(dialogMachineSelection.getByRole("button")).toHaveCount(activeMachines.length);
      await dialogMachineSelection.getByRole("button", { name: selectedMachine.name, exact: true }).click();

      await expect(dialogMachineSelection).not.toBeVisible();

      await expect(spanCurrentUserMode).toBeVisible();
      await expect(spanCurrentUserMode).toHaveText(selectedMachine.name);
    });
  }
});

test(
  "a user mode cookie from an older version asks for the user mode again",
  { annotation: TestAnnotations.UserModeNull },
  async ({ page, baseURL }) => {
    const spanCurrentUserMode = page.getByTestId("span-current-user-mode");
    const dialogLogin = page.getByTestId("form-login");

    await page.context().addCookies([
      {
        name: AppContextStorage.COOKIE_NAME,
        value: encodeURIComponent(JSON.stringify({ userMode: "Admininistrador", userModeMachineId: "1" })),
        url: baseURL!,
      },
    ]);
    await page.goto("/");

    await expect(dialogLogin).toBeVisible();
    await expect(spanCurrentUserMode).toHaveText("");

    await dialogLogin.getByRole("button", { name: UserMode.User }).click();
    await expect(dialogLogin).not.toBeVisible();
    await expect(spanCurrentUserMode).toHaveText(UserMode.User);
    await expect(page.getByRole("link", { name: "Servir Artículos" })).toBeVisible();
  },
);

const adminPaths = [
  "/sell-order",
  "/create-sell-order",
  "/create-production-order",
  "/invoicing",
  "/maintenance",
  "/price-calculator",
  ...mockParts.filter((part) => part.deletedAt === null).map((part) => `/price-calculator/${part.id}`),
];
const machinePaths = ["/production", "/production-history"];
const createDeliveryNotePaths = ["/create-delivery-note"];
const everyUserModePaths = ["/treatment"];
const sellOrderDeliveryNoteLines = mockDeliveryNoteLines.filter((line) => line.sellOrderLineId !== null);
const getSellOrderReference = (sellOrderLineId: number) => {
  const sellOrder = getMockSellOrderById(getMockSellOrderLineById(sellOrderLineId)!.sellOrderId)!;
  return sellOrder.clientReference ?? String(sellOrder.id);
};

// Every user mode opens the Pedido de venta, but only the Administrador changes it or sees its prices
async function assertSellOrderPage(page: Page, sellOrderId: number, userMode: UserMode) {
  const isAdmin = userMode === UserMode.Admin;
  const path = `/sell-order/${sellOrderId}`;
  // The other user modes ignore the search params that open the creation of a Línea and its price
  await page.goto(isAdmin ? path : `${path}?createSellOrderLine=true&editPartPriceId=${mockPartPrices[0].id}`);
  await expect(page, path).toHaveURL((url) => url.pathname === path);

  const formSellOrder = page.getByTestId("form-sell-order");
  const tableSellOrderLine = formSellOrder.getByTestId("table-sell-order-line");
  await assertFormLoaded(formSellOrder);
  await expect(getTableRows(tableSellOrderLine).or(getTableNoDataRow(tableSellOrderLine)).first()).toBeVisible();

  await expect(page.getByRole("link", { name: "Ver Pedidos de venta", exact: true })).toBeVisible({ visible: isAdmin });
  await expect(page.getByRole("link", { name: "Crear Pedido de venta", exact: true })).toBeVisible({
    visible: isAdmin,
  });
  await expect(formSellOrder.getByTestId(/^button-(delete|restore)-sell-order$/)).toHaveCount(isAdmin ? 1 : 0);
  for (const header of ["Precio", "Total"]) {
    await expect(tableSellOrderLine.getByRole("columnheader", { name: header, exact: true })).toBeVisible({
      visible: isAdmin,
    });
  }
  await expect(formSellOrder.getByTestId("span-sell-order-lines-total")).toBeVisible({ visible: isAdmin });
  if (isAdmin) return;

  await expect(getFormInputByLabel(formSellOrder, "Referencia del Cliente")).not.toBeEditable();
  await expect(formSellOrder.getByTestId("button-submit-form-sell-order")).toHaveCount(0);
  await expect(formSellOrder.getByTestId("button-add-sell-order-line")).toHaveCount(0);
  await expect(tableSellOrderLine.getByTestId("editable-cell-input")).toHaveCount(0);
  await expect(tableSellOrderLine.getByTestId(/^button-(delete|restore)$/)).toHaveCount(0);
  await expect(page.getByTestId("dialog-create-sell-order-line")).toHaveCount(0);
}

// A test for each user mode, as the browser runs out of resources after many page loads in the same page
for (const { userMode, machineId, allowedPaths, blockedPaths } of [
  {
    userMode: UserMode.Admin,
    allowedPaths: [...adminPaths, ...createDeliveryNotePaths, ...everyUserModePaths],
    blockedPaths: machinePaths,
  },
  {
    userMode: UserMode.User,
    allowedPaths: [...createDeliveryNotePaths, ...everyUserModePaths],
    blockedPaths: [...adminPaths, ...machinePaths],
  },
  ...activeMachines.map((machine) => ({
    allowedPaths: [...machinePaths, ...everyUserModePaths],
    blockedPaths: [...adminPaths, ...createDeliveryNotePaths],
    machineId: machine.id,
    userMode: UserMode.Machine,
  })),
]) {
  test(`as ${userMode}${machineId === undefined ? "" : ` ${machineId}`}, only open its own pages`, async ({
    page,
    db,
  }) => {
    await setUserMode(page, userMode, machineId);

    for (const path of blockedPaths) {
      await page.goto(path);
      await expect(page, path).toHaveURL((url) => url.pathname === "/");
    }
    for (const path of allowedPaths) {
      await page.goto(path);
      await expect(page, path).toHaveURL((url) => url.pathname === path);
    }
    for (const sellOrder of mockSellOrders) {
      await assertSellOrderPage(page, sellOrder.id, userMode);
    }

    if (machineId !== undefined) {
      // A Máquina only looks up its own production history, even when the URL asks for every Máquina
      const tableMachineProductionHistory = page.getByTestId("table-machine-production-history");
      const machineProductions = mockPartProduction.filter((production) => production.machineId === machineId);
      await page.goto(
        `/production-history?${new URLSearchParams({
          "table-machine-production-history": JSON.stringify({ filters: [{ id: "machineId", value: null }] }),
        })}`,
      );
      await assertTableRowCount(tableMachineProductionHistory, machineProductions.length);
      await expect(tableMachineProductionHistory.getByRole("columnheader", { name: "Referencia" })).toBeVisible();
      await expect(tableMachineProductionHistory.getByRole("columnheader", { name: "Máquina" })).toHaveCount(0);

      for (const production of machineProductions) {
        const rowProduction = getTableRowByTestId(tableMachineProductionHistory, production.id);
        const productionOrder = mockProductionOrders.find(({ id }) => id === production.productionOrderId)!;
        if (productionOrder.sellOrderLineId === null) {
          // Without a Línea there is no Referencia of a Cliente, so it lists every Referencia of the Artículo
          await expect(rowProduction.getByRole("link", { name: "Artículo", exact: true })).toBeVisible();
          await expect(rowProduction.getByTestId("tooltip-part-references")).toBeVisible({
            visible: mockPartReferences.some((partReference) => partReference.partId === productionOrder.partId),
          });
          // Only the Artículo and the Orden de producción, as there is no Pedido nor Cliente
          await expect(rowProduction.getByRole("link")).toHaveCount(2);
        } else {
          const sellOrderLine = getMockSellOrderLineById(productionOrder.sellOrderLineId)!;
          const sellOrder = getMockSellOrderById(sellOrderLine.sellOrderId)!;
          await expect(
            rowProduction.getByRole("link", {
              name: getMockPartReferenceById(sellOrderLine.partReferenceId)?.reference ?? "Artículo",
              exact: true,
            }),
          ).toBeVisible();
          await expect(
            rowProduction.getByRole("link", { name: getSellOrderReference(sellOrderLine.id), exact: true }),
          ).toBeVisible();
          // A Máquina can not open the Cliente, so its name is not a link
          await expect(
            rowProduction.getByText(getMockClientById(sellOrder.clientId)!.name, { exact: true }),
          ).toBeVisible();
          await expect(
            rowProduction.getByRole("link", { name: getMockClientById(sellOrder.clientId)!.name }),
          ).toHaveCount(0);
        }
      }
    }

    // The pages every user mode opens link to the Pedido de venta
    for (const deliveryNoteId of new Set(sellOrderDeliveryNoteLines.map((line) => line.deliveryNoteId))) {
      await page.goto(`/delivery-note/${deliveryNoteId}`);
      for (const deliveryNoteLine of sellOrderDeliveryNoteLines.filter(
        (line) => line.deliveryNoteId === deliveryNoteId,
      )) {
        const sellOrderReference = getSellOrderReference(deliveryNoteLine.sellOrderLineId!);
        const rowDeliveryNoteLine = getTableRowByTestId(
          page.getByTestId("table-delivery-note-line"),
          deliveryNoteLine.id,
        );
        await expect(rowDeliveryNoteLine).toContainText(sellOrderReference);
        await expect(rowDeliveryNoteLine.getByRole("link", { name: sellOrderReference })).toHaveCount(1);
      }
    }

    // Every user mode looks the Albaranes up, but a Máquina cannot create them
    const canCreateDeliveryNotes = userMode !== UserMode.Machine;
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Tratamiento", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Albaranes", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Servir Artículos" })).toBeVisible({
      visible: canCreateDeliveryNotes,
    });

    await page.goto("/delivery-note");
    for (const deliveryNote of mockDeliveryNotes) {
      await expect(getTableRowByTestId(page.getByTestId("table-delivery-note"), deliveryNote.id)).toBeVisible();
    }
    await expect(page.getByRole("link", { name: "Crear Albarán" })).toBeVisible({ visible: canCreateDeliveryNotes });

    await page.goto("/delivery-note?createDeliveryNote=true");
    await expect(page.getByTestId("dialog-create-edit-delivery-note")).toBeVisible({
      visible: canCreateDeliveryNotes,
    });

    // Last, as deleting the Cliente changes the pages of its Pedidos de venta
    const clientDeletedSellOrder = mockSellOrders.find((sellOrder) => sellOrder.deletedAt === null)!;
    await db
      .update(dbTableClient)
      .set({ deletedAt: MOCK_INITIAL_DATE })
      .where(eq(dbTableClient.id, clientDeletedSellOrder.clientId));
    await assertSellOrderPage(page, clientDeletedSellOrder.id, userMode);
    await expect(page.getByTestId("badge-sell-order-status")).toContainText("Cliente eliminado");
  });
}

test(
  "only the Administrador session can make admin changes",
  { annotation: [TestAnnotations.UserModeNull, TestAnnotations.NonEmptyErrorsLogFile] },
  async ({ page, db, baseURL, toasts }) => {
    const accountedInvoice = mockInvoices.find((invoice) => invoice.accounted)!;
    const dialogLogin = page.getByTestId("form-login");
    const dialogInputAdminPassword = page.getByTestId("form-admin-password");
    const inputAdminPassword = getFormInputByLabel(dialogInputAdminPassword, "Introduce la contraseña");

    const getAdminSessionCookie = async () =>
      (await page.context().cookies()).find((cookie) => cookie.name === ADMIN_SESSION_COOKIE_NAME);
    // The page only offers the change to the Administrador, so the session changes while its request is on the way
    const assertAdminChangeRejected = async (changeSession: () => Promise<void>) => {
      await page.goto("/invoicing");
      await holdRequestWhile({
        page,
        procedurePath: "invoice.unaccount",
        send: async () =>
          workflowUnaccountInvoice(page, accountedInvoice.id, "Esta acción solo la puede hacer el Administrador"),
        meanwhile: changeSession,
      });
      expect((await getInvoiceById(accountedInvoice.id))?.accounted).toBe(true);
    };

    await test.step("without a session", async () => {
      await setUserMode(page, UserMode.Admin);
      await assertAdminChangeRejected(async () => page.context().clearCookies());
    });

    await test.step("with the user mode cookie set to Administrador by hand", async () => {
      await setUserMode(page, UserMode.Admin);
      await assertAdminChangeRejected(async () => {
        await page.context().clearCookies();
        await page.context().addCookies([AppContextStorage.testCookie(baseURL!, UserMode.Admin)]);
      });

      // The page drops that user mode too, so it has to be picked again
      await page.reload();
      await expect(dialogLogin).toBeVisible();
      await expect(page.getByTestId("span-current-user-mode")).not.toHaveText(UserMode.Admin);
    });

    await test.step("with a wrong password", async () => {
      await dialogLogin.getByRole("button", { name: UserMode.Admin }).click();
      await inputAdminPassword.fill(`${process.env.ADMIN_PASSWORD}-incorrecta`);
      await dialogInputAdminPassword.getByTestId("button-submit").click();
      await expect(toasts).toHaveCount(1);
      await expect(toasts.first()).toContainText("Contraseña incorrecta");
      await expect(dialogInputAdminPassword).toBeVisible();
      expect(await getAdminSessionCookie()).toBeUndefined();
    });

    await test.step("with the right password", async () => {
      await inputAdminPassword.fill(process.env.ADMIN_PASSWORD!);
      await dialogInputAdminPassword.getByTestId("button-submit").click();
      await expect(dialogInputAdminPassword).not.toBeVisible();
      await expect(page.getByTestId("span-current-user-mode")).toHaveText(UserMode.Admin);

      // The page script cannot read the session, so it cannot be copied to another browser by a script
      expect((await getAdminSessionCookie())?.httpOnly).toBe(true);
      await page.goto("/invoicing");
      await workflowUnaccountInvoice(page, accountedInvoice.id);
      expect((await getInvoiceById(accountedInvoice.id))?.accounted).toBe(false);
    });

    await test.step("a request from another page of the same host is rejected even with the session", async () => {
      await db.update(dbTableInvoice).set({ accounted: true }).where(eq(dbTableInvoice.id, accountedInvoice.id));

      // Sent outside the page, so it carries the session cookie while saying where it comes from, as a browser would
      const unaccountInvoiceFrom = async (fetchSite: string) =>
        page.request.post("/api/trpc/invoice.unaccount", {
          data: { id: accountedInvoice.id },
          headers: { "Sec-Fetch-Site": fetchSite },
        });

      const sameSiteResponse = await unaccountInvoiceFrom("same-site");
      expect(sameSiteResponse.status()).toBe(403);
      expect(await sameSiteResponse.text()).toBe("Forbidden");
      expect((await getInvoiceById(accountedInvoice.id))?.accounted).toBe(true);

      expect((await unaccountInvoiceFrom("same-origin")).status()).toBe(200);
      expect((await getInvoiceById(accountedInvoice.id))?.accounted).toBe(false);
    });

    await test.step("logging out in another tab closes the session", async () => {
      await db.update(dbTableInvoice).set({ accounted: true }).where(eq(dbTableInvoice.id, accountedInvoice.id));

      await assertAdminChangeRejected(async () =>
        inAnotherTab(page, async (anotherPage) => {
          await anotherPage.goto("/");
          await anotherPage.getByTestId("button-logout").click();
          await expect(anotherPage.getByTestId("form-login")).toBeVisible();
          await expect.poll(getAdminSessionCookie).toBeUndefined();
        }),
      );
    });
  },
);
