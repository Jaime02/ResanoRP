// bun --env-file=<env> timeline.ts <baseURL> <path>
import { chromium } from "@playwright/test";
import { AppContextStorage, UserMode } from "@/contexts/app-context";
import { ADMIN_SESSION_COOKIE_NAME, getAdminSessionToken } from "@/lib/admin-session";
const [baseURL, path] = process.argv.slice(2);
const browser = await chromium.launch();
for (let run = 0; run < 2; run++) {
  const context = await browser.newContext({ baseURL, ignoreHTTPSErrors: true });
  await context.addCookies([AppContextStorage.testCookie(baseURL, UserMode.Admin), { httpOnly: true, name: ADMIN_SESSION_COOKIE_NAME, sameSite: "Lax", secure: true, url: baseURL, value: getAdminSessionToken(process.env.ADMIN_PASSWORD!)! }]);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  let t0 = 0;
  const events: string[] = [];
  const sync = new Map<string, { start: number; first?: number; last?: number; bytes: number }>();
  cdp.on("Network.requestWillBeSent", (e) => {
    if (e.type === "Document" && t0 === 0) t0 = e.timestamp;
    if (/sync\/stream|sync\/checkpoint|api\/models/.test(e.request.url)) sync.set(e.requestId, { start: e.timestamp, bytes: 0 });
  });
  cdp.on("Network.dataReceived", (e) => {
    const s = sync.get(e.requestId);
    if (s) { s.first ??= e.timestamp; s.last = e.timestamp; s.bytes += e.encodedDataLength; }
  });
  await page.goto(path, { waitUntil: "commit" });
  const shown = await page.waitForFunction(() => document.querySelector("table[data-row-count]") !== null && document.querySelector(":not([inert]) > table [data-testid='tr-skeleton']") === null && performance.now(), undefined, { polling: "raf", timeout: 60_000 });
  const nav = await page.evaluate(() => { const n = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming; return { responseEnd: n.responseEnd, domContentLoaded: n.domContentLoadedEventEnd, load: n.loadEventEnd }; });
  console.log(`run ${run}: shown ${Math.round(await shown.jsonValue() as number)} ms, html ${Math.round(nav.responseEnd)} dcl ${Math.round(nav.domContentLoaded)} load ${Math.round(nav.load)}`);
  for (const s of sync.values()) console.log(`  sync req start ${Math.round((s.start - t0) * 1000)} first byte ${s.first ? Math.round((s.first - t0) * 1000) : "-"} last byte ${s.last ? Math.round((s.last - t0) * 1000) : "-"} KB ${Math.round(s.bytes / 1024)}`);
  await context.close();
}
await browser.close();
