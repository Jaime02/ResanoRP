import fs from "node:fs";

import { test as base, expect } from "@playwright/test";
import type { BrowserContext, Page, PlaywrightTestArgs, TestAnnotation, TestInfo } from "@playwright/test";

import { AppContextStorage, UserMode } from "@/contexts/app-context";
import { cleanDatabase, type TDatabase } from "@/db";
import { ADMIN_SESSION_COOKIE_NAME, getAdminSessionToken } from "@/lib/admin-session";
import { errorsLogFilePath } from "@/logging/logger";
import { resetBlueprints, resetSellOrders, resetTags } from "@/scripts/reset-env";
import { MOCK_INITIAL_DATE } from "@/tests/mock-data";
import { getToasts } from "@/tests/utils/components/toast";
import { seedDatabase } from "@/tests/utils/db";
import type { BaseMachine } from "@/types/machine";

export const TestAnnotations: Record<string, TestAnnotation> = {
  // Initiallize the page with the given user mode
  UserModeAdmin: { description: UserMode.Admin, type: "user_mode" as const },
  UserModeUser: { description: UserMode.User, type: "user_mode" as const },
  UserModeMachine: { description: UserMode.Machine, type: "user_mode" as const },
  UserModeNull: { type: "user_mode_null" as const },

  // Start the test with an empty database
  EmptyDatabase: { type: "empty_database" as const },

  // Reset the blueprints to the initial state after the test
  ResetBlueprints: { type: "reset_blueprints" as const },

  // Reset the sell orders to the initial state after the test
  ResetSellOrders: { type: "reset_sell_orders" as const },

  // Empty the generated tags before and after the test
  ResetTags: { type: "reset_tags" as const },
} as const;

const LOG_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

// Each worker runs a single test at a time, so the events expected by the current test can live in the module
let expectedErrorsLogEvents: Array<Record<string, unknown>> = [];

// The events, in any order, that the current test must log in the errors log file, and nothing else
export function expectErrorsLog(...events: Array<Record<string, unknown>>) {
  expectedErrorsLogEvents.push(
    ...events.map((event) => ({ timestamp: expect.stringMatching(LOG_TIMESTAMP_PATTERN), ...event })),
  );
}

function readErrorsLog(): Array<unknown> {
  return fs
    .readFileSync(errorsLogFilePath, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as unknown);
}

export interface TUserConfig {
  userMode: UserMode;
  machineId?: number;
}

const FAILED_REQUEST_CONSOLE_MESSAGE = "Failed to load resource";
// Only a performance hint, emitted when a render crosses a time threshold, so it depends on the machine speed
const LIVE_QUERY_WARNING_CONSOLE_MESSAGE = "[useLiveQuery] Deriving live query identity";

interface TestFixture {
  page: Page;
  db: TDatabase;
  toasts: ReturnType<typeof getToasts>;
  openPage: (userConfig: TUserConfig) => Promise<Page>;
  forEachTest: void;
  afterEachTest: void;
}

export type TestContext = PlaywrightTestArgs & TestFixture;

function hasAnnotation(testInfo: TestInfo, annotation: TestAnnotation) {
  return testInfo.annotations.some(({ type }) => type === annotation.type);
}

function getAnnotatedUserConfig(testInfo: TestInfo): TUserConfig | null {
  if (hasAnnotation(testInfo, TestAnnotations.UserModeNull)) return null;
  const userMode = testInfo.annotations.find(({ type }) => type === TestAnnotations.UserModeAdmin.type)?.description;
  return { userMode: (userMode as UserMode | undefined) ?? UserMode.Admin };
}

export const test = base.extend<TestFixture>({
  afterEachTest: [
    // oxlint-disable-next-line no-empty-pattern
    async ({}, use, testInfo) => {
      await use();
      if (hasAnnotation(testInfo, TestAnnotations.ResetBlueprints)) {
        await resetBlueprints();
      }
      if (hasAnnotation(testInfo, TestAnnotations.ResetSellOrders)) {
        await resetSellOrders();
      }
      if (hasAnnotation(testInfo, TestAnnotations.ResetTags)) {
        await resetTags();
      }

      if (expectedErrorsLogEvents.length === 0) {
        expect(readErrorsLog(), `Errors log file (${errorsLogFilePath}) should be empty`).toEqual([]);
      }
    },
    { auto: true },
  ],
  db: [
    // oxlint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const db = (await import("@/db")).default;
      await cleanDatabase(db);
      await use(db);
    },
    { auto: true },
  ],
  forEachTest: [
    async ({ db }, use, testInfo) => {
      if (!hasAnnotation(testInfo, TestAnnotations.EmptyDatabase)) {
        await seedDatabase(db);
      }

      if (hasAnnotation(testInfo, TestAnnotations.ResetTags)) {
        await resetTags();
      }

      fs.truncateSync(errorsLogFilePath);
      expectedErrorsLogEvents = [];
      await use();
    },
    { auto: true },
  ],
  page: async ({ page, baseURL }, use, testInfo) => {
    await prepareContext(page.context(), baseURL!, getAnnotatedUserConfig(testInfo));
    const assertNoUnexpectedErrors = await preparePage(page);

    await use(page);

    if (expectedErrorsLogEvents.length > 0) {
      // Errors reported by the client are logged by a request sent after the UI has already reacted. Polling here,
      // while the page is still open, lets that request finish; closing the page first would abort it.
      // The order is not checked, as the requests of the server and the client race
      const message = `Errors log file (${errorsLogFilePath}) should have the expected events`;
      await expect.poll(readErrorsLog, { message }).toEqual(expect.arrayContaining(expectedErrorsLogEvents));
      expect(readErrorsLog(), message).toHaveLength(expectedErrorsLogEvents.length);
    }
    assertNoUnexpectedErrors();
  },
  toasts: async ({ page }, use) => {
    const toasts = getToasts(page);
    await use(toasts);
  },
  // Pages of other browsers, each one with its own cookies, so they work in another user mode at the same time
  openPage: async ({ browser, baseURL }, use) => {
    const contexts: Array<BrowserContext> = [];
    const assertions: Array<() => void> = [];
    await use(async (userConfig) => {
      const context = await browser.newContext({ baseURL, ignoreHTTPSErrors: true });
      contexts.push(context);
      await prepareContext(context, baseURL!, userConfig);
      const anotherPage = await context.newPage();
      assertions.push(await preparePage(anotherPage));
      return anotherPage;
    });
    for (const assertNoUnexpectedErrors of assertions) {
      assertNoUnexpectedErrors();
    }
    await Promise.all(contexts.map(async (context) => context.close()));
  },
});

// A browser has its own clock and its own cookies, which hold its user mode. Without a user mode it is asked for one
async function prepareContext(context: BrowserContext, baseURL: string, userConfig: TUserConfig | null) {
  await context.clock.install({ time: MOCK_INITIAL_DATE });
  if (userConfig !== null) {
    await addUserModeCookies(context, baseURL, userConfig);
  }
}

// Returns the check that fails the test on the warnings, errors and uncaught exceptions the page logged
async function preparePage(page: Page) {
  const consoleMessages: Array<{ type: string; text: string }> = [];
  const pageErrors: Array<Error> = [];

  page.on("console", (msg) => {
    if (
      process.env.IGNORE_LIVEQUERY_WARNINGS === "true" &&
      msg.type() === "warning" &&
      msg.text().startsWith(LIVE_QUERY_WARNING_CONSOLE_MESSAGE)
    ) {
      return;
    }
    if (msg.type() === "warning" || msg.type() === "error") {
      consoleMessages.push({ text: msg.text(), type: msg.type() });
    }
  });

  page.on("pageerror", (err) => {
    pageErrors.push(err);
  });

  // Override page.goto and page.reload to wait for hydration in every test
  const originalGoto = page.goto.bind(page);
  page.goto = async (url, options) => {
    const response = await originalGoto(url, options);
    // Only the pages of the app hydrate, not the plain responses of the file routes
    if (!response || response.headers()["content-type"]?.startsWith("text/html")) {
      await page.waitForSelector("body[data-hydrated]");
    }
    return response;
  };
  const originalReload = page.reload.bind(page);
  page.reload = async (options) => {
    const response = await originalReload(options);
    await page.waitForSelector("body[data-hydrated]");
    return response;
  };

  // Disable all animations and transitions to make tests more stable and faster
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const disableAnimationsStyleTag = document.createElement("style");
      disableAnimationsStyleTag.innerHTML = `
          *, *::before, *::after {
            animation-duration: 0s !important;
            animation-delay: 0s !important;
            transition-duration: 0s !important;
            transition-delay: 0s !important;
          }
        `;
      document.head.appendChild(disableAnimationsStyleTag);
    });
  });

  return () => {
    // The browser logs every failed request on its own, and it cannot be silenced from the page, so
    // a test that expects a request to be rejected also expects those messages
    const unexpectedConsoleMessages =
      expectedErrorsLogEvents.length > 0
        ? consoleMessages.filter((consoleMessage) => !consoleMessage.text.startsWith(FAILED_REQUEST_CONSOLE_MESSAGE))
        : consoleMessages;
    expect.soft(unexpectedConsoleMessages, "Console should not have warnings or errors").toEqual([]);
    expect
      .soft(
        pageErrors.map((error) => error.stack ?? error.message),
        "Page should not have any uncaught errors",
      )
      .toEqual([]);
  };
}

// Another tab of the same browser, so it shares the cookies, and the user mode, of the page
export async function inAnotherTab(page: Page, run: (anotherPage: Page) => Promise<void>) {
  const anotherPage = await page.context().newPage();
  const assertNoUnexpectedErrors = await preparePage(anotherPage);
  await run(anotherPage);
  assertNoUnexpectedErrors();
  await anotherPage.close();
}

// The server only takes the Administrador from the session cookie it sets once the password is checked
async function addUserModeCookies(context: BrowserContext, baseURL: string, { userMode, machineId }: TUserConfig) {
  await context.addCookies([AppContextStorage.testCookie(baseURL, userMode, machineId)]);
  if (userMode === UserMode.Admin) {
    await context.addCookies([
      {
        httpOnly: true,
        name: ADMIN_SESSION_COOKIE_NAME,
        sameSite: "Lax",
        secure: true,
        url: baseURL,
        value: getAdminSessionToken(process.env.ADMIN_PASSWORD!)!,
      },
    ]);
  } else {
    await context.clearCookies({ name: ADMIN_SESSION_COOKIE_NAME });
  }
}

// Overrides the user mode cookies set by the fixture, so they apply from the next request on
export async function setUserMode(page: Page, userMode: UserMode, machineId?: number) {
  await addUserModeCookies(page.context(), test.info().project.use.baseURL!, { machineId, userMode });
}

export async function pickActiveMachine(page: Page, machine: BaseMachine) {
  const dialogPickMachine = page.getByTestId("form-machine-selection");
  await expect(dialogPickMachine).toBeVisible();

  await dialogPickMachine.getByRole("button", { name: machine.name, exact: true }).click();

  await expect(dialogPickMachine).not.toBeVisible();
}
