/**
 * Measures what virtualizing the rows of the production orders table saves when it shows every row ("Mostrar todo").
 * The build must read the `bench-virtualized` localStorage key ("off" renders every row, as without virtualization),
 * so both modes run in one build on one stack, and they take turns sample by sample.
 *
 * MSYS_NO_PATHCONV=1 bun --env-file=benchmark/stacks/<name>/.env benchmark/tools/virtualization.ts <samples> https://host:port
 *
 * Per sample and row set (the default status filter, every status):
 * - show all: from the click on "Mostrar todo" until the table stops changing
 * - scroll: 80 steps of 60 px, one per frame, scrolled by script with the mouse off the table, so hovering does not load
 *   blueprints. Frame intervals and main thread time
 * - pin / unpin: from the click on a row until the table stops changing (every rendered row renders again)
 * - DOM nodes and JS heap after showing all, after a garbage collection
 * - "show all" includes the live query of the rows it adds, which takes the same time in both modes
 */
import { chromium } from "@playwright/test";
import type { CDPSession, Page } from "@playwright/test";

import { AppContextStorage, UserMode } from "@/contexts/app-context";
import { ADMIN_SESSION_COOKIE_NAME, getAdminSessionToken } from "@/lib/admin-session";
import { ProductionOrderStatus } from "@/schemas/production-order";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD) throw new Error("ADMIN_PASSWORD is not set");
const [samplesArgument = "5", baseURL] = process.argv.slice(2);
if (baseURL === undefined) throw new Error("Usage: virtualization.ts <samples> https://host:port");
const samples = Number(samplesArgument);

const MODES = ["virtualized", "all rows"] as const;
type TMode = (typeof MODES)[number];
const ROW_SETS = {
  default: undefined,
  "all statuses": [{ id: "statuses", value: Object.values(ProductionOrderStatus) }],
} as const;
type TRowSet = keyof typeof ROW_SETS;
const QUIET_MS = 500;
const SCROLL_STEPS = 80;
const SCROLL_STEP_PX = 60;

type TMetrics = Record<string, number>;
type TSample = {
  rowCount: string;
  showAllMs: number;
  showAllTaskMs: number;
  domNodes: number;
  heapMB: number;
  scrollFrameP50: number;
  scrollFrameP95: number;
  scrollFramesOver20: number;
  scrollTaskMs: number;
  pinMs: number;
  unpinMs: number;
};

const browser = await chromium.launch();

async function newPage(mode: TMode) {
  const context = await browser.newContext({ baseURL, ignoreHTTPSErrors: true, viewport: { width: 1536, height: 742 } });
  await context.addCookies([
    AppContextStorage.testCookie(baseURL, UserMode.Admin),
    {
      httpOnly: true,
      name: ADMIN_SESSION_COOKIE_NAME,
      sameSite: "Lax",
      secure: true,
      url: baseURL,
      value: getAdminSessionToken(ADMIN_PASSWORD!)!,
    },
  ]);
  await context.addInitScript((off) => {
    if (off) localStorage.setItem("bench-virtualized", "off");
    else localStorage.removeItem("bench-virtualized");
  }, mode === "all rows");
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Performance.enable");
  return { page, cdp, close: () => context.close() };
}

async function metrics(cdp: CDPSession): Promise<TMetrics> {
  const { metrics: list } = await cdp.send("Performance.getMetrics");
  return Object.fromEntries(list.map(({ name, value }) => [name, value]));
}

// Resolves with the time from the next click until the table stopped changing for QUIET_MS
async function armSettle(page: Page) {
  await page.evaluate((quietMs) => {
    const state = window as unknown as { settle?: Promise<number> };
    const table = document.querySelector("[data-testid='table-production-order']")!.closest("[data-panel]")!;
    state.settle = new Promise<number>((resolve) => {
      let clickAt = 0;
      let lastChange = 0;
      let timer: ReturnType<typeof setTimeout>;
      const observer = new MutationObserver(() => {
        lastChange = performance.now();
        clearTimeout(timer);
        timer = setTimeout(() => {
          observer.disconnect();
          resolve(lastChange - clickAt);
        }, quietMs);
      });
      document.addEventListener(
        "click",
        () => {
          clickAt = performance.now();
          observer.observe(table, { subtree: true, childList: true, attributes: true, characterData: true });
        },
        { capture: true, once: true },
      );
    });
  }, QUIET_MS);
}
const settled = (page: Page) => page.evaluate(() => (window as unknown as { settle: Promise<number> }).settle);

async function waitForData(page: Page) {
  await page.waitForFunction(
    () =>
      document.querySelector("[data-testid='table-production-order'] > table[data-row-count]") !== null &&
      document.querySelector("[data-testid='table-production-order'] [data-testid='tr-skeleton']") === null,
    undefined,
    { timeout: 120_000 },
  );
  // The live queries keep filling in the rows for a moment after the first data
  let previous = "";
  for (;;) {
    const content = await page.locator("[data-testid='table-production-order']").textContent();
    if (content === previous) return;
    previous = content ?? "";
    await page.waitForTimeout(1_500);
  }
}

// PROFILE="<row set>|<mode>" prints where the show all click of that cell spends its time, by self time
function printProfile(profile: {
  nodes: Array<{ id: number; callFrame: { functionName: string; url: string; lineNumber: number; columnNumber: number } }>;
  samples?: Array<number>;
  timeDeltas?: Array<number>;
}) {
  const nodes = new Map(profile.nodes.map((node) => [node.id, node.callFrame]));
  const selfMs = new Map<string, number>();
  profile.samples?.forEach((id, index) => {
    const { functionName, url, lineNumber, columnNumber } = nodes.get(id)!;
    const key = `${functionName || "(anonymous)"} ${url.split("/").at(-1)}:${lineNumber + 1}:${columnNumber + 1}`;
    selfMs.set(key, (selfMs.get(key) ?? 0) + (profile.timeDeltas?.[index] ?? 0) / 1000);
  });
  for (const [key, ms] of [...selfMs].sort((a, b) => b[1] - a[1]).slice(0, 25)) {
    console.error(`${ms.toFixed(0).padStart(7)} ms  ${key}`);
  }
}

const quantile = (values: Array<number>, q: number) =>
  [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * q))];

async function sample(mode: TMode, rowSet: TRowSet): Promise<TSample> {
  const { page, cdp, close } = await newPage(mode);
  try {
    const filters = ROW_SETS[rowSet];
    const state = filters === undefined ? {} : { filters };
    await page.goto(`/production-order?${new URLSearchParams({ "table-production-order": JSON.stringify(state) })}`);
    await waitForData(page);
    // The mouse stays off the table, so no row is hovered
    await page.mouse.move(5, 5);

    const profiled = process.env.PROFILE === `${rowSet}|${mode}`;
    if (profiled) {
      await cdp.send("Profiler.enable");
      await cdp.send("Profiler.start");
    }
    await armSettle(page);
    const beforeShowAll = await metrics(cdp);
    await page.getByTestId("button-toggle-pagination").click();
    const showAllMs = await settled(page);
    const afterShowAll = await metrics(cdp);
    if (profiled) printProfile((await cdp.send("Profiler.stop")).profile);
    // Without it the heap measures when the collector last ran rather than what the page keeps
    await cdp.send("HeapProfiler.collectGarbage");
    const afterGC = await metrics(cdp);
    const rowCount = (await page
      .locator("[data-testid='table-production-order'] > table")
      .getAttribute("data-row-count"))!;

    const beforeScroll = await metrics(cdp);
    const frames = await page.evaluate(
      async ({ steps, stepPx }) => {
        const table = document.querySelector("[data-testid='table-production-order']")!;
        let element = table.parentElement!;
        while (!["auto", "scroll"].includes(getComputedStyle(element).overflowY)) element = element.parentElement!;
        const intervals: Array<number> = [];
        let last = await new Promise<number>(requestAnimationFrame);
        for (let step = 0; step < steps; step++) {
          element.scrollTop += stepPx;
          const now = await new Promise<number>(requestAnimationFrame);
          intervals.push(now - last);
          last = now;
        }
        return intervals;
      },
      { steps: SCROLL_STEPS, stepPx: SCROLL_STEP_PX },
    );
    await page.waitForTimeout(QUIET_MS);
    const afterScroll = await metrics(cdp);

    const firstRowClient = page
      .locator("[data-testid='table-production-order'] > table > tbody > tr[data-row-type='row']")
      .first()
      .getByTestId("clientName");
    await armSettle(page);
    await firstRowClient.click();
    const pinMs = await settled(page);
    await armSettle(page);
    await firstRowClient.click();
    const unpinMs = await settled(page);
    await page.mouse.move(5, 5);

    return {
      rowCount,
      showAllMs,
      showAllTaskMs: (afterShowAll.TaskDuration - beforeShowAll.TaskDuration) * 1000,
      domNodes: afterGC.Nodes,
      heapMB: afterGC.JSHeapUsedSize / 1024 / 1024,
      scrollFrameP50: quantile(frames, 0.5),
      scrollFrameP95: quantile(frames, 0.95),
      scrollFramesOver20: frames.filter((frame) => frame > 20).length,
      scrollTaskMs: (afterScroll.TaskDuration - beforeScroll.TaskDuration) * 1000,
      pinMs,
      unpinMs,
    };
  } finally {
    await close();
  }
}

// Not measured: the first load of each row set warms the server and the browser's caches alike for both modes
for (const rowSet of Object.keys(ROW_SETS) as Array<TRowSet>) await sample("virtualized", rowSet);

const results = new Map<string, Array<TSample>>();
for (let run = 0; run < samples; run++) {
  // Rotates which mode goes first, so a slower moment of the machine hits both alike
  const modes = run % 2 === 0 ? MODES : [...MODES].reverse();
  for (const rowSet of Object.keys(ROW_SETS) as Array<TRowSet>) {
    for (const mode of modes) {
      const key = `${rowSet} | ${mode}`;
      const result = await sample(mode, rowSet);
      results.set(key, [...(results.get(key) ?? []), result]);
      console.error(`run ${run + 1}/${samples} ${key}: ${JSON.stringify(result)}`);
    }
  }
}
await browser.close();

const median = (values: Array<number>) => quantile(values, 0.5);
const columns: Array<[string, (rows: Array<TSample>) => string]> = [
  ["rows", (rows) => [...new Set(rows.map((row) => row.rowCount))].join("/")],
  ["show all ms", (rows) => median(rows.map((row) => row.showAllMs)).toFixed(0)],
  ["show all task ms", (rows) => median(rows.map((row) => row.showAllTaskMs)).toFixed(0)],
  ["DOM nodes", (rows) => median(rows.map((row) => row.domNodes)).toFixed(0)],
  ["heap MB", (rows) => median(rows.map((row) => row.heapMB)).toFixed(1)],
  ["scroll frame p50", (rows) => median(rows.map((row) => row.scrollFrameP50)).toFixed(1)],
  ["scroll frame p95", (rows) => median(rows.map((row) => row.scrollFrameP95)).toFixed(1)],
  [`frames >20ms /${SCROLL_STEPS}`, (rows) => median(rows.map((row) => row.scrollFramesOver20)).toFixed(0)],
  ["scroll task ms", (rows) => median(rows.map((row) => row.scrollTaskMs)).toFixed(0)],
  ["pin ms", (rows) => median(rows.map((row) => row.pinMs)).toFixed(0)],
  ["unpin ms", (rows) => median(rows.map((row) => row.unpinMs)).toFixed(0)],
];
console.log(`${samples} samples per cell, medians. ${baseURL}`);
console.log(["row set | mode", ...columns.map(([name]) => name)].join("\t"));
for (const [key, rows] of results) console.log([key, ...columns.map(([, value]) => value(rows))].join("\t"));
