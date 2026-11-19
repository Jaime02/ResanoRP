// Whether a save is confirmed on a page whose first sync request was replayed by the document's inline script.
// Renames machine 1 and back, and prints how long each save took until its toast and the client ids of the requests:
// bun --env-file=<stack .env> benchmark/tools/write-check.ts <baseURL>
import { chromium } from "@playwright/test";

import { AppContextStorage, UserMode } from "@/contexts/app-context";
import { ADMIN_SESSION_COOKIE_NAME, getAdminSessionToken } from "@/lib/admin-session";

const [baseURL] = process.argv.slice(2);
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
const page = await context.newPage();
page.setDefaultTimeout(20_000);
page.on("request", (request) => {
  if (!request.url().includes("/powersync/")) return;
  const body = JSON.parse(request.postData() ?? "{}") as { client_id?: string };
  console.log(`  ${new URL(request.url()).pathname} client_id ${body.client_id}`);
});
const form = page.getByTestId("form-machine");
for (const load of ["first load", "reload"]) {
  console.log(load);
  await page.goto("/machine/1");
  await form.locator("input:not([value=\"\"])").first().waitFor();
  const input = form.locator("input").first();
  const name = await input.inputValue();
  for (const newName of [`${name}x`, name]) {
    await input.fill(newName);
    const start = performance.now();
    await form.getByTestId("button-submit").click();
    const toast = page.getByTestId("toast-viewport").getByTestId("toast-root").first();
    await toast.waitFor({ timeout: 20_000 });
    console.log(`  saved "${newName}": ${await toast.getAttribute("data-type")} toast after ${Math.round(performance.now() - start)} ms`);
    await page.waitForTimeout(6000);
  }
}
await browser.close();
