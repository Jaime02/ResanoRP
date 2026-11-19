// Every request of a page load, with when it started and ended, until the data shows. The loads share a browser
// profile, so the first one is cold and the others are warm:
// bun --env-file=<stack .env> benchmark/tools/requests.ts <baseURL> <path> [loads]
import { chromium } from "@playwright/test";

import { AppContextStorage, UserMode } from "@/contexts/app-context";
import { ADMIN_SESSION_COOKIE_NAME, getAdminSessionToken } from "@/lib/admin-session";

const [baseURL, path, loads = "2"] = process.argv.slice(2);
const browser = await chromium.launch();
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
for (let load = 0; load < Number(loads); load++) {
  if (process.env.INIT_STORAGE !== undefined) {
    await context.addInitScript((key) => localStorage.setItem(key, "1"), process.env.INIT_STORAGE);
  }
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  let navigationStart = 0;
  const requests = new Map<string, { url: string; start: number; firstByte?: number; end?: number }>();
  cdp.on("Network.requestWillBeSent", (event) => {
    if (event.type === "Document" && navigationStart === 0) navigationStart = event.timestamp;
    requests.set(event.requestId, { start: event.timestamp, url: event.request.url });
  });
  cdp.on("Network.responseReceived", (event) => {
    const request = requests.get(event.requestId);
    if (request) request.firstByte = event.timestamp;
  });
  cdp.on("Network.dataReceived", (event) => {
    const request = requests.get(event.requestId);
    if (request) request.end = event.timestamp;
  });
  cdp.on("Network.loadingFinished", (event) => {
    const request = requests.get(event.requestId);
    if (request) request.end = event.timestamp;
  });
  await page.goto(path, { waitUntil: "commit" });
  const shown = await page.waitForFunction(
    () =>
      document.querySelector("table[data-row-count]") !== null &&
      document.querySelector(":not([inert]) > table [data-testid='tr-skeleton']") === null &&
      performance.now(),
    undefined,
    { polling: "raf", timeout: 60_000 },
  );
  console.log(`load ${load}: data shown at ${Math.round((await shown.jsonValue()) as number)} ms`);
  const ms = (timestamp?: number) =>
    timestamp === undefined ? "    -" : String(Math.round((timestamp - navigationStart) * 1000)).padStart(5);
  for (const request of requests.values()) {
    console.log(
      `  ${ms(request.start)} ${ms(request.firstByte)} ${ms(request.end)}  ${new URL(request.url).pathname.slice(0, 40)}`,
    );
  }
  if (process.env.CLEAR_STORAGE !== undefined) await page.evaluate(() => localStorage.clear());
  await page.close();
}
await context.close();
await browser.close();
