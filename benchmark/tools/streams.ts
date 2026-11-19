// bun --env-file=<env> streams.ts <baseURL> <path>...
import { chromium } from "@playwright/test";
import { AppContextStorage, UserMode } from "@/contexts/app-context";
import { ADMIN_SESSION_COOKIE_NAME, getAdminSessionToken } from "@/lib/admin-session";
const [baseURL, ...paths] = process.argv.slice(2);
const browser = await chromium.launch();
for (const path of paths) {
  const context = await browser.newContext({ baseURL, ignoreHTTPSErrors: true });
  await context.addCookies([AppContextStorage.testCookie(baseURL, UserMode.Admin), { httpOnly: true, name: ADMIN_SESSION_COOKIE_NAME, sameSite: "Lax", secure: true, url: baseURL, value: getAdminSessionToken(process.env.ADMIN_PASSWORD!)! }]);
  const page = await context.newPage();
  const requests: string[][] = [];
  page.on("request", (r) => { if (r.url().includes("sync/stream")) requests.push(JSON.parse(r.postData()!).streams.subscriptions.map((s: { stream: string }) => s.stream)); });
  await page.goto(path, { waitUntil: "commit" });
  await page.waitForTimeout(6000);
  console.log(path, requests.map((r) => r.sort().join(",")).join("  ==>  "));
  await context.close();
}
await browser.close();
