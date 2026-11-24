import fs from "node:fs";

import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { addMonths } from "date-fns";

import { UserMode } from "@/contexts/app-context";
import { USER_IP_CONSTRAINT, dbTableUser } from "@/db/schema";
import { getAuditDocumentLabel, getAuditLogRange } from "@/lib/backoffice";
import { addAppDays, startOfAppMonth } from "@/lib/dates";
import { DateFormat, formatDate } from "@/lib/formatters";
import { errorsLogFilePath } from "@/logging/logger";
import {
  AUDIT_ADMIN_LABEL,
  AUDIT_NOT_ADMIN_LABEL,
  AUDIT_LOG_LABEL,
  AUDIT_OK_LABEL,
  ERRORS_LOG_LABEL,
  IP_LABEL,
  LOG_CLEARED_MESSAGE,
  USERS_LABEL,
  USER_CREATE_TITLE,
  USER_CREATED_MESSAGE,
  USER_DELETED_MESSAGE,
  USER_EDITED_MESSAGE,
  USER_IP_INVALID_MESSAGE,
  USER_IP_TAKEN_MESSAGE,
  getAuditLogStartNote,
  getAuditUserNameLabel,
} from "@/messages/backoffice";
import { NAME_LABEL, NEXT_PAGE_LABEL, NO_DATA_MESSAGE } from "@/messages/common";
import { CONFIGURATION_EDITED_MESSAGE, VAT_PERCENTAGE_LABEL } from "@/messages/configuration";
import type { TTableAuditLogState } from "@/schemas/audit-log";
import { mockSellOrders } from "@/tests/mock-data";
import { readAuditLog } from "@/tests/utils/audit-log";
import { openAndConfirmAlertDialog } from "@/tests/utils/components/alert-dialog";
import { InputElementType, assertFormLoaded, getFormInputByLabel } from "@/tests/utils/components/form";
import {
  assertTableRowCount,
  findTableRowByText,
  getTablePagerButton,
  getTableRows,
} from "@/tests/utils/components/table";
import { expectSingleSuccessToast, expectSingleToast } from "@/tests/utils/components/toast";
import { expectUniqueViolationRejected, uniqueColumnsViolation } from "@/tests/utils/errors-log";
import { TestAnnotations, test } from "@/tests/utils/fixtures";
import { getMockSellOrderLines } from "@/tests/utils/mock-data-utils";
import { readSyncedAuditLogIds } from "@/tests/utils/powersync";
import { workflowDeleteSellOrderLine, workflowOpenSellOrder } from "@/tests/workflows/sell-order";

const EDITED_VAT_PERCENTAGES = [10, 11];
const LONG_AGO = new Date("2000-01-01");

async function editVatPercentage(page: Page, vatPercentage: number) {
  const formConfiguration = page.getByTestId("form-configuration");
  await assertFormLoaded(formConfiguration);
  await getFormInputByLabel(formConfiguration, VAT_PERCENTAGE_LABEL, InputElementType.Number).fill(
    String(vatPercentage),
  );
  await formConfiguration.getByTestId("button-submit").click();
  await expectSingleSuccessToast(page, CONFIGURATION_EDITED_MESSAGE);
}

// The server stamps the entries with its own time, and the Backoffice shows the current month of the browser, whose mock
// clock starts on another month
test.beforeEach(async ({ page }) => {
  await page.clock.setSystemTime(new Date());
});

test("the Backoffice shows the audit log in a readable way and clears the errors log", async ({
  page,
  openPage,
  baseURL,
}) => {
  const formConfiguration = page.getByTestId("form-configuration");
  const tableAuditLog = page.getByTestId("table-audit-log");

  const [firstVatPercentage, otherBrowserVatPercentage] = EDITED_VAT_PERCENTAGES;

  await test.step("the audit log lists the mutation of this browser", async () => {
    await page.goto("/maintenance?tab=configuration");
    await editVatPercentage(page, firstVatPercentage);

    await formConfiguration.getByTestId("button-link-backoffice").click();
    await expect(page).toHaveURL((url) => url.pathname === "/backoffice");
    await assertTableRowCount(tableAuditLog, 1);
  });

  await test.step("the audit log shows at once the mutation of another browser, with its toast message", async () => {
    const otherPage = await openPage({ userMode: UserMode.Admin });
    await otherPage.goto("/maintenance?tab=configuration");
    await editVatPercentage(otherPage, otherBrowserVatPercentage);

    await assertTableRowCount(tableAuditLog, EDITED_VAT_PERCENTAGES.length);
    await expect(getTableRows(tableAuditLog).first().getByTestId("input")).toContainText(
      String(otherBrowserVatPercentage),
    );
    const expectedCells = {
      description: CONFIGURATION_EDITED_MESSAGE,
      path: "configuration.update",
      result: AUDIT_OK_LABEL,
      user: AUDIT_ADMIN_LABEL,
    };
    for (const [columnId, text] of Object.entries(expectedCells)) {
      await expect(getTableRows(tableAuditLog).first().getByTestId(columnId)).toHaveText(text);
    }
    const newestTimestamp = (await readAuditLog()).at(-1)!.timestamp;
    await expect(getTableRows(tableAuditLog).first().getByTestId("timestamp")).toHaveText(
      String(formatDate(newestTimestamp, DateFormat.DatetimeSeconds)),
    );
  });

  await test.step("the audit log is paged, newest first", async () => {
    const state: TTableAuditLogState = { pagination: { pageSize: 1 } };
    await page.goto(`/backoffice?${new URLSearchParams({ "table-audit-log": JSON.stringify(state) })}`);
    await assertTableRowCount(tableAuditLog, EDITED_VAT_PERCENTAGES.length);
    await expect(getTableRows(tableAuditLog)).toHaveCount(1);
    const newestInput = await getTableRows(tableAuditLog).first().getByTestId("input").innerText();
    expect(newestInput).toContain(String(EDITED_VAT_PERCENTAGES.at(-1)));

    await getTablePagerButton(tableAuditLog, NEXT_PAGE_LABEL).click();
    await expect(getTableRows(tableAuditLog)).toHaveCount(1);
    await expect(getTableRows(tableAuditLog).first().getByTestId("input")).toContainText(
      String(EDITED_VAT_PERCENTAGES[0]),
    );
    await expect(getTablePagerButton(tableAuditLog, NEXT_PAGE_LABEL)).toBeDisabled();
  });

  await test.step("the audit log is filtered", async () => {
    const filteredStates: Array<{ state: TTableAuditLogState; rowCount: number }> = [
      { rowCount: EDITED_VAT_PERCENTAGES.length, state: { filters: [{ id: "path", value: "CONFIGURATION" }] } },
      { rowCount: 0, state: { filters: [{ id: "path", value: "invoice" }] } },
      { rowCount: EDITED_VAT_PERCENTAGES.length, state: { filters: [{ id: "ok", value: true }] } },
      { rowCount: 0, state: { filters: [{ id: "ok", value: false }] } },
      {
        rowCount: EDITED_VAT_PERCENTAGES.length,
        state: { filters: [{ id: "user", value: AUDIT_ADMIN_LABEL.toUpperCase() }] },
      },
      { rowCount: 0, state: { filters: [{ id: "user", value: AUDIT_NOT_ADMIN_LABEL }] } },
      {
        rowCount: EDITED_VAT_PERCENTAGES.length,
        state: { filters: [{ id: "timestamp", value: { startDate: LONG_AGO } }] },
      },
      { rowCount: 0, state: { filters: [{ id: "timestamp", value: { endDate: LONG_AGO } }] } },
    ];
    const [{ timestamp: loggedDay, ip }] = await readAuditLog();
    const loggedIp = ip!;
    filteredStates.push(
      { rowCount: EDITED_VAT_PERCENTAGES.length, state: { filters: [{ id: "ip", value: loggedIp }] } },
      { rowCount: 0, state: { filters: [{ id: "ip", value: `${loggedIp}0` }] } },
      {
        rowCount: EDITED_VAT_PERCENTAGES.length,
        state: { filters: [{ id: "timestamp", value: { endDate: loggedDay, startDate: loggedDay } }] },
      },
      { rowCount: 0, state: { filters: [{ id: "timestamp", value: { startDate: addAppDays(loggedDay, 1) } }] } },
      { rowCount: 0, state: { filters: [{ id: "timestamp", value: { endDate: addAppDays(loggedDay, -1) } }] } },
    );
    for (const { state, rowCount } of filteredStates) {
      await page.goto(`/backoffice?${new URLSearchParams({ "table-audit-log": JSON.stringify(state) })}`);
      await assertTableRowCount(tableAuditLog, rowCount);
    }
  });

  await test.step("only an admin session syncs the audit log, and only the months it subscribes to", async () => {
    const currentMonths = getAuditLogRange().months;
    expect(await readSyncedAuditLogIds(baseURL!, true, currentMonths)).toHaveLength((await readAuditLog()).length);
    expect(await readSyncedAuditLogIds(baseURL!, false, currentMonths)).toEqual([]);
    const nextMonth = addMonths(new Date(), 1);
    expect(
      await readSyncedAuditLogIds(
        baseURL!,
        true,
        getAuditLogRange({ endDate: nextMonth, startDate: nextMonth }).months,
      ),
    ).toEqual([]);
  });

  await test.step("the errors log is shown and cleared", async () => {
    const errorMessage = "Something failed";
    fs.appendFileSync(
      errorsLogFilePath,
      `${JSON.stringify({ level: "error", message: errorMessage, timestamp: "2026-01-01 00:00:00" })}\n`,
    );
    await page.goto("/backoffice");
    await page.getByRole("tab", { name: ERRORS_LOG_LABEL }).click();
    const listErrors = page.getByTestId("list-errors-log");
    await expect(listErrors).toContainText(errorMessage);

    await page.getByTestId("button-clear-errors-log").click();
    await page.getByTestId("dialog-clear-log-content").getByTestId("button-action").click();
    await expectSingleSuccessToast(page, LOG_CLEARED_MESSAGE);
    await expect(listErrors).toHaveCount(0);
    await expect(page.getByRole("tabpanel").getByText(NO_DATA_MESSAGE)).toBeVisible();
    expect(fs.readFileSync(errorsLogFilePath, "utf-8")).toBe("");
  });

  // Last, as the browser stays a month ahead
  await test.step("without a start date the audit log shows a single month", async () => {
    const nextMonth = addMonths(new Date(), 1);
    await page.clock.setSystemTime(nextMonth);
    await page.goto("/backoffice");
    await expect(page.getByText(getAuditLogStartNote(String(formatDate(startOfAppMonth(nextMonth)))))).toBeVisible();
    await assertTableRowCount(tableAuditLog, 0);

    const loggedDay = (await readAuditLog())[0].timestamp;
    const state: TTableAuditLogState = { filters: [{ id: "timestamp", value: { startDate: loggedDay } }] };
    await page.goto(`/backoffice?${new URLSearchParams({ "table-audit-log": JSON.stringify(state) })}`);
    await expect(page.getByText(getAuditLogStartNote(String(formatDate(loggedDay))))).toBeVisible();
    await assertTableRowCount(tableAuditLog, EDITED_VAT_PERCENTAGES.length);
  });
});

test(
  "the audit log names the document a change was made to",
  { annotation: TestAnnotations.ResetSellOrders },
  async ({ page }) => {
    const tableAuditLog = page.getByTestId("table-audit-log");
    const sellOrder = mockSellOrders[0];
    const sellOrderLine = getMockSellOrderLines(sellOrder.id)[0];
    const lineDeletePath = "sellOrderLine.delete";
    const sellOrderLabel = getAuditDocumentLabel(lineDeletePath, String(sellOrder.id));

    await test.step("a change to a line is of its Pedido", async () => {
      await workflowOpenSellOrder(page, sellOrder.id);
      await workflowDeleteSellOrderLine(page, sellOrderLine.id);
      expect((await readAuditLog()).map(({ path, documentId }) => ({ documentId, path }))).toEqual([
        { documentId: String(sellOrder.id), path: lineDeletePath },
      ]);

      await page.goto("/backoffice");
      await expect(getTableRows(tableAuditLog).first().getByTestId("document")).toHaveText(sellOrderLabel);
    });

    await test.step("the audit log is filtered by document", async () => {
      const filteredStates: Array<{ state: TTableAuditLogState; rowCount: number }> = [
        { rowCount: 1, state: { filters: [{ id: "document", value: sellOrderLabel.toUpperCase() }] } },
        { rowCount: 0, state: { filters: [{ id: "document", value: `${sellOrderLabel}0` }] } },
      ];
      for (const { state, rowCount } of filteredStates) {
        await page.goto(`/backoffice?${new URLSearchParams({ "table-audit-log": JSON.stringify(state) })}`);
        await assertTableRowCount(tableAuditLog, rowCount);
      }
    });
  },
);

test("the Usuarios of the Backoffice name an IP in the header and in the audit log", async ({ page, db }) => {
  const tableUser = page.getByTestId("table-user");
  const tableAuditLog = page.getByTestId("table-audit-log");
  const dialogCreateEditUser = page.getByTestId("dialog-create-edit-user");
  const spanCurrentUserName = page.getByTestId("span-current-user-name");
  const userName = "Juan";
  const otherIp = "10.0.0.1";
  const fillUser = async (name: string, ip: string) => {
    await getFormInputByLabel(dialogCreateEditUser, NAME_LABEL).fill(name);
    await getFormInputByLabel(dialogCreateEditUser, IP_LABEL).fill(ip);
    await dialogCreateEditUser.getByTestId("button-submit").click();
  };
  const openCreateUser = async () => {
    await page.getByRole("button", { name: USER_CREATE_TITLE }).click();
    await expect(dialogCreateEditUser).toBeVisible();
  };

  await test.step("a Usuario needs a valid IP, and one of another machine does not name this browser", async () => {
    await page.goto("/backoffice");
    await page.getByRole("tab", { name: USERS_LABEL }).click();
    await openCreateUser();
    await fillUser(userName, "not an ip");
    await expect(dialogCreateEditUser.getByText(USER_IP_INVALID_MESSAGE)).toBeVisible();

    await fillUser(userName, otherIp);
    await expect(dialogCreateEditUser).not.toBeVisible();
    await expectSingleSuccessToast(page, USER_CREATED_MESSAGE);
    await expect(await findTableRowByText(tableUser, userName)).toBeVisible();
    expect(await db.select().from(dbTableUser)).toEqual([expect.objectContaining({ ip: otherIp, name: userName })]);
    await expect(spanCurrentUserName).toHaveCount(0);
  });

  // The IP the server sees for this browser is the one of the entry of the create
  const browserIp = (await readAuditLog())[0].ip!;

  await test.step("the IP of this browser shows its name at once in the header and in the audit log", async () => {
    await (await findTableRowByText(tableUser, userName)).getByTestId("button-edit").click();
    await assertFormLoaded(dialogCreateEditUser);
    await fillUser(userName, browserIp);
    await expectSingleSuccessToast(page, USER_EDITED_MESSAGE);
    await expect(spanCurrentUserName).toHaveText(userName);

    await page.getByRole("tab", { name: AUDIT_LOG_LABEL }).click();
    await expect(getTableRows(tableAuditLog).first().getByTestId("user")).toHaveText(
      getAuditUserNameLabel(userName, AUDIT_ADMIN_LABEL),
    );
    const state: TTableAuditLogState = { filters: [{ id: "user", value: userName.toLowerCase() }] };
    await page.goto(`/backoffice?${new URLSearchParams({ "table-audit-log": JSON.stringify(state) })}`);
    await assertTableRowCount(tableAuditLog, (await readAuditLog()).length);
  });

  await test.step("an IP has a single Usuario", async () => {
    await page.getByRole("tab", { name: USERS_LABEL }).click();
    await openCreateUser();
    await fillUser("Ana", browserIp);
    await expectSingleToast(page, USER_IP_TAKEN_MESSAGE);
    expectUniqueViolationRejected(
      uniqueColumnsViolation(USER_IP_CONSTRAINT, dbTableUser, [[dbTableUser.ip, browserIp]]),
      USER_IP_TAKEN_MESSAGE,
    );
    await dialogCreateEditUser.getByTestId("button-close").click();
    await expect(dialogCreateEditUser).not.toBeVisible();
  });

  await test.step("deleting the Usuario takes its name out of the header", async () => {
    await openAndConfirmAlertDialog(
      page,
      (await findTableRowByText(tableUser, userName)).getByTestId("button-delete"),
      "dialog-delete-model-content",
    );
    await expectSingleSuccessToast(page, USER_DELETED_MESSAGE);
    await expect(spanCurrentUserName).toHaveCount(0);
    expect(await db.select().from(dbTableUser)).toEqual([]);
  });
});
