// Every change of the tables during one in-app navigation, after loading another page first, with how many rows and
// characters they show: bun --env-file=<env> nav-timeline.ts <baseURL> <from path,...> <to path> [runs]. Several from
// paths are visited in order, the first loaded and the next ones reached in-app, as a user moves around the app
import { chromium } from "@playwright/test";

import { AppContextStorage, UserMode } from "@/contexts/app-context";
import { ADMIN_SESSION_COOKIE_NAME, getAdminSessionToken } from "@/lib/admin-session";

const [baseURL, from, to, runs = "3"] = process.argv.slice(2);
const browser = await chromium.launch();
for (let run = 0; run < Number(runs); run++) {
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
  await context.addInitScript(() => {
    const state = window as unknown as { __changes: Array<string>; __start: number };
    state.__changes = [];
    state.__start = 0;
    let last = "";
    const check = () => {
      const tables = [...document.querySelectorAll("table")];
      const loading = document.querySelector(":not([inert]) > table [data-testid='tr-skeleton']") !== null;
      const content = `${location.pathname} ${loading ? "loading" : tables.map((table) => table.textContent).join("\n")}`;
      if (content !== last && state.__start > 0) {
        last = content;
        state.__changes.push(
          `${String(Math.round(performance.now() - state.__start)).padStart(5)} ms ${location.pathname} ${loading ? "skeletons" : `rows ${tables.map((table) => table.dataset.rowCount ?? "-").join(",")}, ${content.length} chars`}`,
        );
      }
      requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  });
  const page = await context.newPage();
  const [first, ...next] = from.split(",");
  await page.goto(first);
  await page.waitForTimeout(6000);
  for (const href of next) {
    await page.evaluate((target) => {
      (window as unknown as { __TSR_ROUTER__: { navigate: (options: { href: string }) => void } }).__TSR_ROUTER__.navigate({ href: target });
    }, href);
    await page.waitForTimeout(6000);
  }
  await page.evaluate((href) => {
    const state = window as unknown as { __start: number; __TSR_ROUTER__: { navigate: (options: { href: string }) => void } };
    state.__start = performance.now();
    state.__TSR_ROUTER__.navigate({ href });
  }, to);
  await page.waitForTimeout(7000);
  console.log(`run ${run}:`);
  for (const change of await page.evaluate(() => (window as unknown as { __changes: Array<string> }).__changes)) {
    console.log(`  ${change}`);
  }
  await context.close();
}
await browser.close();
