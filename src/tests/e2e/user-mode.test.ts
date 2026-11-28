import { expect } from "@playwright/test";
import type { Page, Route } from "@playwright/test";
import { eq } from "drizzle-orm";

import { AppContextStorage, UserMode } from "@/contexts/app-context";
import { getInvoiceById } from "@/db/functions/invoice";
import { dbTableClient, dbTableInvoice } from "@/db/schema";
import { ADMIN_SESSION_COOKIE_NAME } from "@/lib/admin-session";
import { ADMIN_LOGIN_ERROR_CODES, ADMIN_SESSION_AUDIT_PATHS } from "@/logging/audit";
import { LogMessages, LoggerLevels } from "@/logging/types";
import {
  MACHINE_LABEL,
  PART_LABEL,
  PRICE_LABEL,
  REFERENCE_LABEL,
  TOTAL_LABEL,
  ADMIN_ONLY_MESSAGE,
} from "@/messages/common";
import { DELIVERY_NOTES_LABEL, DELIVERY_NOTE_CREATE_TITLE } from "@/messages/delivery-note";
import {
  ADMIN_LOGOUT_FAILED_MESSAGE,
  SERVE_PARTS_LABEL,
  WRONG_PASSWORD_MESSAGE,
  ENTER_PASSWORD_LABEL,
} from "@/messages/home";
import { PART_CREATE_TITLE } from "@/messages/part";
import {
  SELL_ORDER_CREATE_TITLE,
  SELL_ORDER_STATUS_CLIENT_DELETED_LABEL,
  VIEW_SELL_ORDERS_LABEL,
  CLIENT_REFERENCE_LABEL,
} from "@/messages/sell-order";
import { TREATMENT_LABEL } from "@/messages/treatment";
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
import { expectAuditLog, expectAuditedRequest } from "@/tests/utils/audit-log";
import { assertFormLoaded, getFormInputByLabel } from "@/tests/utils/components/form";
import { openPartPicker } from "@/tests/utils/components/picker";
import {
  assertTableRowCount,
  getTableNoDataRow,
  getTableRowByTestId,
  getTableRows,
} from "@/tests/utils/components/table";
import { expectSingleToast } from "@/tests/utils/components/toast";
import {
  clientErrorEvent,
  clientLogEvent,
  httpRequestFailedEvent,
  holdRequestAndExpectRejection,
} from "@/tests/utils/errors-log";
import { TestAnnotations, expectErrorsLog, inAnotherTab, setUserMode, test } from "@/tests/utils/fixtures";
import {
  getMockClientById,
  getMockPartReferenceById,
  getMockSellOrderById,
  getMockSellOrderLineById,
} from "@/tests/utils/mock-data-utils";
import { workflowUnaccountInvoice } from "@/tests/workflows/invoice";
import { TRPC_URL } from "@/trpc/trpc-client";
import { ToastType } from "@/types/toast";

const activeMachines = mockMachines.filter((machine) => machine.deletedAt === null);

// The default base of the server functions of TanStack Start, which the app keeps
const SERVER_FUNCTIONS_URL = "**/_serverFn/**";
// What fetch rejects with in Chromium when the request gets no response, like when the server is unreachable
const FAILED_FETCH_MESSAGE = "Failed to fetch";

async function openLoginDialog(page: Page) {
  await page.goto("/");
  await page.context().clearCookies({ name: AppContextStorage.COOKIE_NAME });
  await page.reload();
  const dialogLogin = page.getByTestId("form-login");
  await expect(dialogLogin).toBeVisible();
  return dialogLogin;
}

test("login with every user mode", { annotation: TestAnnotations.UserModeNull }, async ({ page, baseURL }) => {
  const spanCurrentUserMode = page.getByTestId("span-current-user-mode");

  await test.step("a user mode cookie from an older version asks for the user mode again", async () => {
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
    await expect(page.getByRole("link", { name: SERVE_PARTS_LABEL })).toBeVisible();
  });

  await test.step("login as admin", async () => {
    const dialogLogin = await openLoginDialog(page);
    const dialogInputAdminPassword = page.getByTestId("form-admin-password");
    await expect(dialogInputAdminPassword).not.toBeVisible();

    await dialogLogin.getByRole("button", { name: UserMode.Admin }).click();

    await expect(dialogLogin).not.toBeVisible();
    await expect(dialogInputAdminPassword).toBeVisible();

    const inputAdminPassword = getFormInputByLabel(dialogInputAdminPassword, ENTER_PASSWORD_LABEL);
    await expect(inputAdminPassword).toBeVisible();

    expect(process.env.ADMIN_PASSWORD).toBeDefined();
    await inputAdminPassword.fill(process.env.ADMIN_PASSWORD!);
    await expect(inputAdminPassword).toHaveValue(process.env.ADMIN_PASSWORD!);

    expectAuditLog({ path: ADMIN_SESSION_AUDIT_PATHS.login, ok: true });
    await dialogInputAdminPassword.getByTestId("button-submit").click();
    await expect(dialogInputAdminPassword).not.toBeVisible();

    await expect(spanCurrentUserMode).toBeVisible();
    await expect(spanCurrentUserMode).toHaveText(UserMode.Admin);
  });

  await test.step("login as user", async () => {
    const dialogLogin = await openLoginDialog(page);
    const buttonUser = dialogLogin.getByRole("button", { name: UserMode.User });

    // The user mode is only saved once the admin session is closed, as the server takes the Administrador from it.
    // The logout is the first POST to the server functions after picking a mode. The error log that follows gets through
    let isLogoutFailed = false;
    const failLogout = async (route: Route) => {
      if (isLogoutFailed || route.request().method() !== "POST") {
        await route.fallback();
        return;
      }
      isLogoutFailed = true;
      await route.abort();
    };
    await page.route(SERVER_FUNCTIONS_URL, failLogout);
    expectErrorsLog(clientErrorEvent(FAILED_FETCH_MESSAGE, { userConfig: null }));
    await buttonUser.click();
    await expectSingleToast(page, { title: ADMIN_LOGOUT_FAILED_MESSAGE, type: ToastType.Error });
    await expect(dialogLogin).toBeVisible();
    await page.unroute(SERVER_FUNCTIONS_URL, failLogout);

    // Leaving the Administrador closes its session, once even if the mode is picked again while it closes. The modes
    // picked next have none to close
    expectAuditLog({ path: ADMIN_SESSION_AUDIT_PATHS.logout, ok: true });
    await buttonUser.dblclick();

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

const adminPaths = [
  "/sell-order",
  "/create-sell-order",
  "/create-production-order",
  "/invoicing",
  "/maintenance",
  "/backoffice",
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

  await expect(page.getByRole("link", { name: VIEW_SELL_ORDERS_LABEL, exact: true })).toBeVisible({ visible: isAdmin });
  await expect(page.getByRole("link", { name: SELL_ORDER_CREATE_TITLE, exact: true })).toBeVisible({
    visible: isAdmin,
  });
  await expect(formSellOrder.getByTestId(/^button-(delete|restore)-sell-order$/)).toHaveCount(isAdmin ? 1 : 0);
  await expect(formSellOrder.getByTestId("button-sell-order-file")).toHaveCount(isAdmin ? 1 : 0);
  for (const header of [PRICE_LABEL, TOTAL_LABEL]) {
    await expect(tableSellOrderLine.getByRole("columnheader", { name: header, exact: true })).toBeVisible({
      visible: isAdmin,
    });
  }
  await expect(formSellOrder.getByTestId("span-sell-order-lines-total")).toBeVisible({ visible: isAdmin });
  if (isAdmin) return;

  await expect(getFormInputByLabel(formSellOrder, CLIENT_REFERENCE_LABEL)).not.toBeEditable();
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

    // Only the Administrador creates Artículos, in another tab so the form behind the picker keeps its values
    await page.goto("/treatment");
    const { dialogPickerPartContent } = await openPartPicker(page, page.getByTestId("picker-treatment-history-part"));
    const linkCreatePart = dialogPickerPartContent.getByRole("link", { name: PART_CREATE_TITLE });
    await expect(linkCreatePart).toBeVisible({ visible: userMode === UserMode.Admin });
    if (userMode === UserMode.Admin) {
      await expect(linkCreatePart).toHaveAttribute("href", "/part?createPart=true");
      await expect(linkCreatePart).toHaveAttribute("target", "_blank");
    }

    for (const sellOrder of mockSellOrders) {
      await assertSellOrderPage(page, sellOrder.id, userMode);
    }
    // Hiding the button is not enough, the file URL must be refused too. The Administrador download is covered in sell-order.test
    if (userMode !== UserMode.Admin) {
      const sellOrderWithFile = mockSellOrders.find((sellOrder) => sellOrder.fileUploadedAt !== null)!;
      const fileUrl = `/api/files/sell-order/${sellOrderWithFile.id}`;
      const fileResponse = await page.goto(fileUrl);
      expect(fileResponse?.status()).toBe(403);
      expectErrorsLog(httpRequestFailedEvent("GET", 403, fileUrl));
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
      await expect(tableMachineProductionHistory.getByRole("columnheader", { name: REFERENCE_LABEL })).toBeVisible();
      await expect(tableMachineProductionHistory.getByRole("columnheader", { name: MACHINE_LABEL })).toHaveCount(0);

      for (const production of machineProductions) {
        const rowProduction = getTableRowByTestId(tableMachineProductionHistory, production.id);
        const productionOrder = mockProductionOrders.find(({ id }) => id === production.productionOrderId)!;
        if (productionOrder.sellOrderLineId === null) {
          // Without a Línea there is no Referencia of a Cliente, so it lists every Referencia of the Artículo
          await expect(rowProduction.getByRole("link", { name: PART_LABEL, exact: true })).toBeVisible();
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
              name: getMockPartReferenceById(sellOrderLine.partReferenceId)?.reference ?? PART_LABEL,
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
    await expect(page.getByRole("link", { name: TREATMENT_LABEL, exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: DELIVERY_NOTES_LABEL, exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: SERVE_PARTS_LABEL })).toBeVisible({
      visible: canCreateDeliveryNotes,
    });

    await page.goto("/delivery-note");
    for (const deliveryNote of mockDeliveryNotes) {
      await expect(getTableRowByTestId(page.getByTestId("table-delivery-note"), deliveryNote.id)).toBeVisible();
    }
    await expect(page.getByRole("link", { name: DELIVERY_NOTE_CREATE_TITLE })).toBeVisible({
      visible: canCreateDeliveryNotes,
    });

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
    await expect(page.getByTestId("badge-sell-order-status")).toContainText(SELL_ORDER_STATUS_CLIENT_DELETED_LABEL);
  });
}

test(
  "only the Administrador session can make admin changes",
  { annotation: TestAnnotations.UserModeNull },
  async ({ page, db, baseURL }) => {
    const accountedInvoice = mockInvoices.find((invoice) => invoice.accounted)!;
    const dialogLogin = page.getByTestId("form-login");
    const dialogInputAdminPassword = page.getByTestId("form-admin-password");
    const inputAdminPassword = getFormInputByLabel(dialogInputAdminPassword, ENTER_PASSWORD_LABEL);

    const getAdminSessionCookie = async () =>
      (await page.context().cookies()).find((cookie) => cookie.name === ADMIN_SESSION_COOKIE_NAME);
    // The page only offers the change to the Administrador, so the session changes while its request is on the way
    const assertAdminChangeRejected = async (
      changeSession: () => Promise<void>,
      userConfig: Parameters<typeof clientLogEvent>[2],
    ) => {
      await page.goto("/invoicing");
      await holdRequestAndExpectRejection({
        page,
        procedurePath: "invoice.unaccount",
        send: async () => workflowUnaccountInvoice(page, accountedInvoice.id, ADMIN_ONLY_MESSAGE),
        meanwhile: changeSession,
        code: "FORBIDDEN",
        message: ADMIN_ONLY_MESSAGE,
        serverError: null,
        userConfig,
      });
      expect((await getInvoiceById(accountedInvoice.id))?.accounted).toBe(true);
    };

    await test.step("without a session", async () => {
      await setUserMode(page, UserMode.Admin);
      await assertAdminChangeRejected(async () => page.context().clearCookies(), null);
    });

    await test.step("with the user mode cookie set to Administrador by hand", async () => {
      await setUserMode(page, UserMode.Admin);
      await assertAdminChangeRejected(
        async () => {
          await page.context().clearCookies();
          await page.context().addCookies([AppContextStorage.testCookie(baseURL!, UserMode.Admin)]);
        },
        { userMode: UserMode.Admin },
      );

      // The page drops that user mode too, so it has to be picked again
      await page.reload();
      await expect(dialogLogin).toBeVisible();
      await expect(page.getByTestId("span-current-user-mode")).not.toHaveText(UserMode.Admin);
    });

    await test.step("with a wrong password", async () => {
      await dialogLogin.getByRole("button", { name: UserMode.Admin }).click();
      await inputAdminPassword.fill(`${process.env.ADMIN_PASSWORD}-incorrecta`);
      expectAuditLog({
        path: ADMIN_SESSION_AUDIT_PATHS.login,
        ok: false,
        errorCode: ADMIN_LOGIN_ERROR_CODES.wrongPassword,
      });
      await dialogInputAdminPassword.getByTestId("button-submit").click();
      await expectSingleToast(page, { title: WRONG_PASSWORD_MESSAGE, type: ToastType.Error });
      expectErrorsLog(clientLogEvent(LoggerLevels.emerg, LogMessages.wrongUserModePassword, {}));
      await expect(dialogInputAdminPassword).toBeVisible();
      expect(await getAdminSessionCookie()).toBeUndefined();
    });

    await test.step("with the right password", async () => {
      await inputAdminPassword.fill(process.env.ADMIN_PASSWORD!);
      expectAuditLog({ path: ADMIN_SESSION_AUDIT_PATHS.login, ok: true });
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

      // No page of the app sends a request from another site of the host, so it is sent from outside the page, with the
      // session cookie and the header a browser would add
      const unaccountInvoiceFrom = async (fetchSite: string) =>
        page.request.post(`${TRPC_URL}/invoice.unaccount`, {
          data: { id: accountedInvoice.id },
          headers: { "Sec-Fetch-Site": fetchSite },
        });

      const sameSiteResponse = await unaccountInvoiceFrom("same-site");
      expect(sameSiteResponse.status()).toBe(403);
      expect(await sameSiteResponse.text()).toBe("Forbidden");
      expect((await getInvoiceById(accountedInvoice.id))?.accounted).toBe(true);

      const sameOriginResponse = await expectAuditedRequest(
        { path: "invoice.unaccount", ok: true, isAdmin: true, input: { id: accountedInvoice.id } },
        async () => unaccountInvoiceFrom("same-origin"),
      );
      expect(sameOriginResponse.status()).toBe(200);
      expect((await getInvoiceById(accountedInvoice.id))?.accounted).toBe(false);
    });

    await test.step("logging out in another tab closes the session", async () => {
      await db.update(dbTableInvoice).set({ accounted: true }).where(eq(dbTableInvoice.id, accountedInvoice.id));

      await assertAdminChangeRejected(
        async () =>
          inAnotherTab(page, async (anotherPage) => {
            await anotherPage.goto("/");
            expectAuditLog({ path: ADMIN_SESSION_AUDIT_PATHS.logout, ok: true });
            await anotherPage.getByTestId("button-logout").click();
            await expect(anotherPage.getByTestId("form-login")).toBeVisible();
            await expect.poll(getAdminSessionCookie).toBeUndefined();
          }),
        {},
      );
    });
  },
);
