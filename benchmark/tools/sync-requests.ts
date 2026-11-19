// When each sync request starts, what it asks for and when its first checkpoint completes, next to when the page's rows
// show: bun --env-file=<env> sync-requests.ts <baseURL> <path> [path to load first, then navigate in-app to <path>]
import { chromium } from "@playwright/test";
import { AppContextStorage, UserMode } from "@/contexts/app-context";
import { ADMIN_SESSION_COOKIE_NAME, getAdminSessionToken } from "@/lib/admin-session";
const [baseURL, path, from] = process.argv.slice(2);
const browser = await chromium.launch();
for (let run = 0; run < 2; run++) {
  const context = await browser.newContext({ baseURL, ignoreHTTPSErrors: true });
  await context.addCookies([AppContextStorage.testCookie(baseURL, UserMode.Admin), { httpOnly: true, name: ADMIN_SESSION_COOKIE_NAME, sameSite: "Lax", secure: true, url: baseURL, value: getAdminSessionToken(process.env.ADMIN_PASSWORD!)! }]);
  await context.addInitScript(() => {
    const log: Array<string> = ((window as any).__syncLog = []);
    const at = () => `${Math.round(performance.now())} ms`;
    const originalFetch = window.fetch;
    window.fetch = async (input, init) => {
      const url = String(input instanceof Request ? input.url : input);
      if (!url.includes("sync/stream")) return originalFetch(input, init);
      const body = JSON.parse(String(init?.body));
      const n = ((window as any).__syncRequests = ((window as any).__syncRequests ?? 0) + 1);
      log.push(`request ${n} start ${at()}: ${body.streams.subscriptions.length} streams, resumes ${body.buckets.length} buckets`);
      const response = await originalFetch(input, init);
      const reader = response.clone().body!.pipeThrough(new TextDecoderStream()).getReader();
      void (async () => {
        let ops = 0;
        let kb = 0;
        try {
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            kb += value.length / 1024;
            ops += value.split('{"op_id"').length - 1;
            if (value.includes('"checkpoint_complete"')) {
              log.push(`request ${n} checkpoint_complete ${at()}: ${ops} ops, ${Math.round(kb)} KB`);
              await reader.cancel();
              break;
            }
          }
        } catch {
          log.push(`request ${n} aborted ${at()} after ${ops} ops`);
        }
      })();
      return response;
    };
    const watch = () => {
      if (!log.some((l) => l.startsWith("rows")) && document.querySelector("[data-testid='input-part-price']")) log.push(`rows shown ${at()}, ${document.querySelectorAll("[data-testid='input-part-price']").length} lines`);
      if (!log.some((l) => l.startsWith("price picker")) && document.querySelector("[data-testid='input-picker-part-price']")) log.push(`price picker mounted ${at()}`);
      const buttons = [...document.querySelectorAll("[data-testid='button-production-order'], [data-testid='button-create-production-order']")].map((b) => b.getAttribute("data-testid")!.replace("button-", ""));
      const summary = `${buttons.filter((b) => b.startsWith("create")).length} create, ${buttons.filter((b) => !b.startsWith("create")).length} open`;
      if (buttons.length && (window as any).__buttons !== summary) log.push(`production order buttons ${at()}: ${((window as any).__buttons = summary)}`);
      const statuses = [...document.querySelectorAll("table tbody tr:not([data-testid='tr-skeleton'])")].filter((row) => row.querySelector("[data-testid='input-part-price']")).map((row) => row.querySelector("td")?.textContent).join(", ");
      if (statuses && (window as any).__statuses !== statuses) log.push(`line statuses ${at()}: ${((window as any).__statuses = statuses)}`);
      requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
  });
  const page = await context.newPage();
  if (from) {
    await page.goto(from, { waitUntil: "commit" });
    await page.waitForTimeout(8000);
    await page.evaluate((to) => {
      (window as any).__syncLog.length = 0;
      (window as any).__syncLog.push(`navigate ${Math.round(performance.now())} ms`);
      void (window as any).__TSR_ROUTER__.navigate({ to });
    }, path);
  } else {
    await page.goto(path, { waitUntil: "commit" });
  }
  await page.waitForTimeout(8000);
  console.log(`run ${run}\n  ${(await page.evaluate(() => (window as any).__syncLog as Array<string>)).join("\n  ")}`);
  await context.close();
}
await browser.close();
