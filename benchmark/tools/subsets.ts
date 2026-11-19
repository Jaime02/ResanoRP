// Which subsets of each table a page of master (Electric, on-demand) asks for, and how much it gets:
// bun --env-file=<stack .env> benchmark/tools/subsets.ts <baseURL> <path>...
import { chromium } from "@playwright/test";

import { AppContextStorage, UserMode } from "@/contexts/app-context";
import { ADMIN_SESSION_COOKIE_NAME, getAdminSessionToken } from "@/lib/admin-session";

const [baseURL, ...paths] = process.argv.slice(2);
const browser = await chromium.launch();
for (const path of paths) {
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
  const subsets: Array<{ at: number; table: string; shape: string; rows: number; kb: number }> = [];
  const pending: Array<Promise<void>> = [];
  page.on("response", (response) => {
    const url = new URL(response.url());
    const table = /\/api\/models\/([a-z_]+)/.exec(url.pathname)?.[1];
    if (table === undefined) return;
    const request = response.request();
    const body = request.method() === "POST" ? (JSON.parse(request.postData() ?? "{}") as Record<string, unknown>) : {};
    const where = String(body.where ?? url.searchParams.get("where") ?? "");
    const parameters = Object.keys((body.params as object | undefined) ?? {}).length;
    const shape = [
      request.method(),
      url.searchParams.get("live") === "true" ? "live" : "",
      where === "" ? "ALL ROWS" : where.replaceAll(/\$\d+(, \$\d+)+/g, `$1..n`).slice(0, 110),
      parameters > 3 ? `[${parameters} params]` : "",
      body.limit === undefined ? "" : `limit ${String(body.limit)}`,
      body.order_by === undefined ? "" : `order ${String(body.order_by).slice(0, 40)}`,
    ]
      .filter((part) => part !== "")
      .join(" | ");
    pending.push(
      response
        .text()
        .then((text) => {
          let rows = 0;
          try {
            const parsed = JSON.parse(text) as unknown;
            const messages = Array.isArray(parsed) ? parsed : ((parsed as { data?: Array<unknown> }).data ?? []);
            rows = messages.filter((message) => (message as { value?: unknown }).value !== undefined).length;
          } catch {
            rows = -1;
          }
          subsets.push({ at: Math.round(performance.now() - navigationStart), kb: Math.round(text.length / 1024), rows, shape, table });
        })
        .catch(() => undefined),
    );
  });
  // FROM=<path,...> loads those pages first, the next ones in-app, and only records what an in-app navigation to <path> asks for, timed from it
  let navigationStart = 0;
  if (process.env.FROM === undefined) {
    await page.goto(path, { waitUntil: "commit" });
  } else {
    const [first, ...next] = process.env.FROM.split(",");
    await page.goto(first, { waitUntil: "commit" });
    await page.waitForTimeout(6000);
    for (const href of next) {
      await page.evaluate((target) => {
        void (window as unknown as { __TSR_ROUTER__: { navigate: (options: { href: string }) => Promise<void> } }).__TSR_ROUTER__.navigate({ href: target });
      }, href);
      await page.waitForTimeout(6000);
    }
    await Promise.all(pending);
    subsets.length = 0;
    navigationStart = performance.now();
    await page.evaluate((href) => {
      void (window as unknown as { __TSR_ROUTER__: { navigate: (options: { href: string }) => Promise<void> } }).__TSR_ROUTER__.navigate({ href });
    }, path);
  }
  await page.waitForTimeout(6000);
  await Promise.all(pending);
  console.log(`\n=== ${path}`);
  const groups = Map.groupBy(
    subsets.filter(({ shape }) => !shape.includes("live")),
    ({ table, shape }) => `${table.padEnd(22)} ${shape}`,
  );
  for (const [key, group] of [...groups].sort()) {
    const rows = group.reduce((sum, { rows }) => sum + rows, 0);
    const kb = group.reduce((sum, { kb }) => sum + kb, 0);
    console.log(`last at ${String(Math.max(...group.map(({ at }) => at))).padStart(5)} ms ${String(group.length).padStart(3)}x ${String(rows).padStart(6)} rows ${String(kb).padStart(6)} KB  ${key}`);
  }
  await context.close();
}
await browser.close();
