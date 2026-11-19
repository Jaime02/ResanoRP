// Opens the same table states on several stacks and checks that each group of them shows the same tables, e.g. a
// branch before and after a change. Each state is a fresh page load, which waits until the tables show data that stays
// unchanged for 1.5 s:
//
//   bun --env-file=<stack .env> benchmark/tools/compare-tables.ts master=https://...:14443 master2=https://...:18443 \
//     -- lite=https://...:16443 lite2=https://...:19443
//
// `--` separates the groups. DATABASE_URL picks the ids the filters use, so every stack must hold the same data.
import { chromium } from "@playwright/test";
import { Pool } from "pg";

import { AppContextStorage, UserMode } from "@/contexts/app-context";
import { ADMIN_SESSION_COOKIE_NAME, getAdminSessionToken } from "@/lib/admin-session";
import { ProductionOrderStatus } from "@/schemas/production-order";
import { SellOrderStatus } from "@/schemas/sell-order";

const STABLE_MS = 1_500;
const groups = process.argv
  .slice(2)
  .join(" ")
  .split(" -- ")
  .map((group) =>
    group
      .split(" ")
      .filter((target) => target !== "")
      .map((target) => {
        const [name, baseURL] = target.split("=");
        return { baseURL, name };
      }),
  );

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const value = async (sql: string) => Object.values((await pool.query<Record<string, unknown>>(sql)).rows[0])[0];
const partWithOrders = await value(
  `SELECT "partId" FROM production_order GROUP BY "partId" ORDER BY count(*) DESC LIMIT 1`,
);
const partWithSellOrders = await value(
  `SELECT pr."partId" FROM sell_order_line l JOIN part_reference pr ON pr.id = l."partReferenceId" GROUP BY pr."partId" ORDER BY count(*) DESC LIMIT 1`,
);
const latestPart = await value(`SELECT max(id) FROM part`);
await pool.end();

const statuses = (...values: Array<string>) => ({ id: "statuses", value: values });
const productionOrders = (state?: object) =>
  `/production-order${state === undefined ? "" : `?${new URLSearchParams({ "table-production-order": JSON.stringify(state) })}`}`;
const sellOrders = (state?: object) =>
  `/sell-order${state === undefined ? "" : `?${new URLSearchParams({ "table-sell-order": JSON.stringify(state) })}`}`;
const pending = statuses(ProductionOrderStatus.Pending, ProductionOrderStatus.InProduction);
const paths: Array<[string, string]> = [
  ["production orders: default", productionOrders()],
  ["production orders: page 3", productionOrders({ filters: [pending], pagination: { pageIndex: 2, pageSize: 10 } })],
  ["production orders: by delivery date", productionOrders({ filters: [pending], sorts: [{ desc: true, id: "requestedDeliveryDate" }] })],
  ["production orders: no status", productionOrders({ filters: [] })],
  ["production orders: completed", productionOrders({ filters: [statuses(ProductionOrderStatus.Completed)] })],
  ["production orders: in production", productionOrders({ filters: [statuses(ProductionOrderStatus.InProduction)] })],
  ["production orders: in treatment", productionOrders({ filters: [statuses(ProductionOrderStatus.InTreatment)] })],
  ["production orders: every status", productionOrders({ filters: [statuses(...Object.values(ProductionOrderStatus))] })],
  ["production orders: pending + deleted", productionOrders({ filters: [statuses(ProductionOrderStatus.Pending, ProductionOrderStatus.Deleted)] })],
  ["production orders: part", productionOrders({ filters: [{ id: "partId", value: partWithOrders }] })],
  ["production orders: part + pending", productionOrders({ filters: [pending, { id: "partId", value: partWithOrders }] })],
  ["production orders: client name + pending", productionOrders({ filters: [pending, { id: "clientName", value: "a" }] })],
  ["production orders: description + pending", productionOrders({ filters: [pending, { id: "partDescription", value: "a" }] })],
  ["sell orders: default", sellOrders()],
  ["sell orders: page 3", sellOrders({ pagination: { pageIndex: 2, pageSize: 10 } })],
  ["sell orders: by client name", sellOrders({ sorts: [{ desc: false, id: "clientName" }] })],
  ["sell orders: by client name desc", sellOrders({ sorts: [{ desc: true, id: "clientName" }] })],
  ["sell orders: pending", sellOrders({ filters: [statuses(SellOrderStatus.Pending)] })],
  ["sell orders: completed", sellOrders({ filters: [statuses(SellOrderStatus.Completed)] })],
  ["sell orders: pending, by client name", sellOrders({ filters: [statuses(SellOrderStatus.Pending)], sorts: [{ desc: true, id: "clientName" }] })],
  ["sell orders: client name", sellOrders({ filters: [{ id: "clientName", value: "a" }] })],
  ["sell orders: client name, by client name", sellOrders({ filters: [{ id: "clientName", value: "a" }], sorts: [{ desc: false, id: "clientName" }] })],
  ["sell orders: part", sellOrders({ filters: [{ id: "partId", value: partWithSellOrders }] })],
  ["sell orders: part + completed", sellOrders({ filters: [statuses(SellOrderStatus.Completed), { id: "partId", value: partWithSellOrders }] })],
  ["part with the most production orders", `/part/${String(partWithOrders)}`],
  ["latest part", `/part/${String(latestPart)}`],
];

type TShown = { at: number; rowCounts: string; tables: string };
const browser = await chromium.launch();
async function show(baseURL: string, path: string) {
  const context = await browser.newContext({ baseURL, ignoreHTTPSErrors: true });
  await context.addCookies([
    AppContextStorage.testCookie(baseURL, UserMode.Admin),
    {
      httpOnly: true,
      name: ADMIN_SESSION_COOKIE_NAME,
      sameSite: "Lax",
      secure: true,
      url: baseURL,
      value: getAdminSessionToken(process.env.ADMIN_PASSWORD!)!,
    },
  ]);
  const page = await context.newPage();
  const errors: Array<string> = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text().slice(0, 200));
  });
  page.on("pageerror", (error) => errors.push(error.message.slice(0, 200)));
  await page.goto(path, { waitUntil: "commit" });
  const shown = (await (
    await page.waitForFunction(
      (stableMs) => {
        const state = window as unknown as { __shown?: TShown };
        const tables = [...document.querySelectorAll("table")];
        const loaded =
          tables.some((table) => table.hasAttribute("data-row-count")) &&
          document.querySelector(":not([inert]) > table [data-testid='tr-skeleton']") === null;
        const content = tables.map((table) => table.textContent).join("\n");
        if (!loaded) {
          state.__shown = undefined;
          return false;
        }
        if (state.__shown?.tables !== content) {
          state.__shown = {
            at: performance.now(),
            rowCounts: tables.map((table) => table.dataset.rowCount ?? "-").join(","),
            tables: content,
          };
        }
        return performance.now() - state.__shown.at >= stableMs && state.__shown;
      },
      STABLE_MS,
      { polling: "raf", timeout: 90_000 },
    )
  ).jsonValue()) as TShown;
  await context.close();
  return { ...shown, errors };
}

let failed = false;
for (const [name, path] of paths) {
  const results = await Promise.all(
    groups.map(async (group) =>
      Promise.all(group.map(async (target) => ({ ...target, ...(await show(target.baseURL, path)) }))),
    ),
  );
  const lines = results.map((group) => {
    const same = group.every(({ tables }) => tables === group[0].tables);
    failed ||= !same || group.some(({ errors }) => errors.length > 0);
    return `${same ? "same" : "DIFFERENT"} [${group.map(({ name: target, rowCounts }) => `${target} ${rowCounts}`).join(" | ")}]`;
  });
  const allSame = results.flat().every(({ tables }) => tables === results[0][0].tables);
  console.log(`${name.padEnd(42)} ${lines.join("  ")}${allSame ? "  all groups same" : ""}`);
  for (const { name: target, errors } of results.flat()) {
    for (const error of new Set(errors)) console.log(`    ! ${target}: ${error}`);
  }
}
await browser.close();
process.exit(failed ? 1 : 0);
