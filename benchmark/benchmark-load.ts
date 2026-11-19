/**
 * Measures how long each page takes to show its data. It only drives the UI, so it compares branches (Electric,
 * PowerSync) side by side: run each one's stack on a copy of the same database and pass them all as targets.
 *
 * bun --env-file=./envs/.env.<env> ./benchmark/benchmark-load.ts [runs] [page filter] [name=https://host:port[@caddy]]...
 *
 * Without targets it measures the env's own stack. DATABASE_URL picks the ids of the detail pages, so every target must
 * hold the same data, and ADMIN_PASSWORD must open all of them. `@caddy` names the target's Caddy container, to count
 * the bytes it sent, workers' requests included.
 *
 * - cold: the page opened in a new browser profile, nothing cached
 * - warm: the page reloaded in a profile that already opened it, with the HTTP cache and anything the sync client
 *   persisted
 * - navigation: the page reached through the app's router, from the page before it in a session that went through
 *   every page in order, as a user moves around the app
 *
 * Every target first goes through a session that is not measured, so its server has created everything a first request
 * creates (e.g. Electric's shapes). Then the targets take turns load by load, in a rotating order, so a slower moment of
 * the machine hits them all alike. The row counts each target shows must be the same, or they did not show the same
 * data.
 */
import { execFileSync } from "node:child_process";

import { chromium } from "@playwright/test";
import type { Page } from "@playwright/test";
import { Pool } from "pg";

import { AppContextStorage, UserMode } from "@/contexts/app-context";
import { ADMIN_SESSION_COOKIE_NAME, getAdminSessionToken } from "@/lib/admin-session";

function getEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") throw new Error(`Environment variable ${name} is not set`);
  return value;
}
const ADMIN_PASSWORD = getEnv("ADMIN_PASSWORD");

const [runsArgument = "3", pageFilter = "", ...targetArguments] = process.argv.slice(2);
const runs = Number(runsArgument);
type TTarget = { name: string; baseURL: string; caddy?: string };
const targets = (
  targetArguments.length > 0
    ? targetArguments
    : [`${getEnv("VITE_ENV_NAME")}=https://${getEnv("VITE_HOST")}:${getEnv("VITE_CADDY_HTTPS_PORT")}`]
).map((argument): TTarget => {
  const match = /^([^=]+)=([^@]+)(?:@(.+))?$/.exec(argument);
  if (match === null) throw new Error(`Invalid target ${argument}, expected name=https://host:port[@caddy]`);
  const [, name, baseURL, caddy] = match;
  return { name, baseURL, caddy };
});

const LOAD_TIMEOUT_MS = 120_000;
// The tables must show the same content this long, so a table that mounts or fills in later is waited for
const STABLE_MS = 1_500;

const pool = new Pool({ connectionString: getEnv("DATABASE_URL") });
// Bun 1.4.4 exits with code 0 and prints nothing when this top-level await rejects in this file
const latestId = async (table: string) =>
  String(
    (
      await pool.query<{ id: number }>(`SELECT max(id) AS id FROM ${table}`).catch((error: unknown) => {
        console.error("Cannot read the detail page ids from DATABASE_URL", error);
        process.exit(1);
      })
    ).rows[0].id,
  );
const pages: Array<[name: string, path: string]> = [
  ["sell orders", "/sell-order"],
  ["delivery notes", "/delivery-note"],
  ["parts", "/part"],
  ["production orders", "/production-order"],
  ["invoicing", "/invoicing"],
  ["treatment", "/treatment"],
  ["create delivery note", "/create-delivery-note"],
  ["sell order", `/sell-order/${await latestId("sell_order")}`],
  ["delivery note", `/delivery-note/${await latestId("delivery_note")}`],
  ["part", `/part/${await latestId("part")}`],
].filter(([name]) => name.includes(pageFilter)) as Array<[string, string]>;
await pool.end();

type TShown = { at: number; rowCounts: string; tables: string };
type TPageState = {
  hydratedAt?: number;
  shown?: TShown;
  // The tables before an in-app navigation, which the next page must replace
  previousTables?: string;
  __TSR_ROUTER__: { navigate: (options: { href: string }) => Promise<void> };
};
type TSample = { dataMs: number; hydratedMs: number; sentKB: number; heapMB: number; rowCounts: string };
type TMode = "cold" | "warm" | "navigation";

const browser = await chromium.launch();

async function newPage({ baseURL }: TTarget): Promise<Page> {
  const context = await browser.newContext({ baseURL, ignoreHTTPSErrors: true });
  await context.addCookies([
    AppContextStorage.testCookie(baseURL, UserMode.Admin),
    {
      httpOnly: true,
      name: ADMIN_SESSION_COOKIE_NAME,
      sameSite: "Lax",
      secure: true,
      url: baseURL,
      value: getAdminSessionToken(ADMIN_PASSWORD)!,
    },
  ]);
  // Checked on every frame from the start of the document, so data a server render already shows counts from its
  // first frame. `shown` is the last time the page's path or tables changed while none of the tables was loading
  await context.addInitScript(() => {
    const state = window as unknown as TPageState;
    let content: string | undefined;
    const check = () => {
      if (state.hydratedAt === undefined && document.querySelector("body[data-hydrated]") !== null) {
        state.hydratedAt = performance.now();
      }
      const tables = [...document.querySelectorAll("table")];
      // A disabled table keeps its skeletons behind its message
      const loaded =
        tables.some((table) => table.hasAttribute("data-row-count")) &&
        document.querySelector(":not([inert]) > table [data-testid='tr-skeleton']") === null;
      const tablesContent = tables.map((table) => table.textContent).join("\n");
      const nextContent = loaded ? `${location.pathname}\n${tablesContent}` : undefined;
      if (nextContent !== content) {
        content = nextContent;
        state.shown = loaded
          ? {
              at: performance.now(),
              rowCounts: tables.map((table) => table.dataset.rowCount ?? "-").join(","),
              tables: tablesContent,
            }
          : undefined;
      }
      requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  });
  return context.newPage();
}

function caddySentBytes({ caddy }: TTarget) {
  if (caddy === undefined) return 0;
  const bytes = execFileSync("docker", ["exec", caddy, "cat", "/sys/class/net/eth0/statistics/tx_bytes"], {
    encoding: "utf8",
  });
  return Number(bytes);
}

// `go` starts the navigation and returns its start on the page's clock
async function measure(target: TTarget, page: Page, go: () => Promise<number>): Promise<TSample> {
  const sentBefore = caddySentBytes(target);
  const start = await go();
  const shown = await page.waitForFunction(
    ([start, stableMs]) => {
      const { shown, previousTables } = window as unknown as TPageState;
      return (
        shown !== undefined &&
        shown.at >= start &&
        shown.tables !== previousTables &&
        performance.now() - shown.at >= stableMs && { at: shown.at, rowCounts: shown.rowCounts }
      );
    },
    [start, STABLE_MS],
    { polling: 100, timeout: LOAD_TIMEOUT_MS },
  );
  const { at, rowCounts } = (await shown.jsonValue()) as Omit<TShown, "tables">;
  const sentKB = Math.round((caddySentBytes(target) - sentBefore) / 1024);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("HeapProfiler.collectGarbage");
  const heapMB = Math.round((await cdp.send("Runtime.getHeapUsage")).usedSize / 2 ** 20);
  await cdp.detach();
  const hydratedAt = await page.evaluate(() => (window as unknown as TPageState).hydratedAt ?? Number.NaN);
  return { dataMs: Math.round(at - start), hydratedMs: Math.round(hydratedAt), sentKB, heapMB, rowCounts };
}

async function load(target: TTarget, page: Page, path: string) {
  return measure(target, page, async () => {
    await page.goto(path, { waitUntil: "commit" });
    return 0;
  });
}

async function navigate(target: TTarget, page: Page, path: string) {
  return measure(target, page, async () =>
    page.evaluate((href) => {
      const state = window as unknown as TPageState;
      state.previousTables = state.shown?.tables;
      const start = performance.now();
      void state.__TSR_ROUTER__.navigate({ href });
      return start;
    }, path),
  );
}

async function session(target: TTarget) {
  const page = await newPage(target);
  await page.goto("/");
  await page.waitForFunction(() => (window as unknown as TPageState).hydratedAt !== undefined);
  const samples: Array<TSample> = [];
  for (const [, path] of pages) samples.push(await navigate(target, page, path));
  await page.context().close();
  return samples;
}

const samples = new Map<string, Array<TSample>>();
function add(page: string, mode: TMode, target: TTarget, sample: TSample) {
  const key = JSON.stringify([page, mode, target.name]);
  samples.set(key, [...(samples.get(key) ?? []), sample]);
}
const rotated = (run: number) => [...targets.slice(run % targets.length), ...targets.slice(0, run % targets.length)];

for (const target of targets) await session(target);

for (const [name, path] of pages) {
  const warmPages = new Map<TTarget, Page>();
  for (const target of targets) {
    const page = await newPage(target);
    await load(target, page, path);
    warmPages.set(target, page);
  }
  for (let run = 0; run < runs; run++) {
    for (const target of rotated(run)) {
      const page = await newPage(target);
      add(name, "cold", target, await load(target, page, path));
      await page.context().close();
      add(name, "warm", target, await load(target, warmPages.get(target)!, path));
    }
  }
  for (const page of warmPages.values()) await page.context().close();
  console.log(`${name}: done`);
}

for (let run = 0; run < runs; run++) {
  for (const target of rotated(run)) {
    (await session(target)).forEach((sample, index) => add(pages[index][0], "navigation", target, sample));
  }
  console.log(`navigation run ${run + 1}: done`);
}
await browser.close();

const median = (values: Array<number>) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const modes: Array<TMode> = ["cold", "warm", "navigation"];
const order = ([page, mode, target]: [string, TMode, string]) =>
  pages.findIndex(([name]) => name === page) * 10_000 +
  modes.indexOf(mode) * 100 +
  targets.findIndex(({ name }) => name === target);
const rows = [...samples].map(([key, values]) => [JSON.parse(key) as [string, TMode, string], values] as const);
rows.sort(([a], [b]) => order(a) - order(b));
console.table(
  rows.map(([[page, mode, target], values]) => {
    const data = values.map((sample) => sample.dataMs);
    return {
      page,
      mode,
      target,
      "data ms": median(data),
      "min-max": `${Math.min(...data)}-${Math.max(...data)}`,
      "hydrated ms": mode === "navigation" ? "-" : median(values.map((sample) => sample.hydratedMs)),
      "sent KB":
        targets.find(({ name }) => name === target)?.caddy === undefined
          ? "-"
          : median(values.map((sample) => sample.sentKB)),
      // Main thread only: a sync client running in a worker keeps its data elsewhere
      "page heap MB": median(values.map((sample) => sample.heapMB)),
      "row counts": [...new Set(values.map((sample) => sample.rowCounts))].join(" | "),
    };
  }),
);
