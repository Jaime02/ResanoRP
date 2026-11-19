// Every Postgres subset request a first load of each path makes on a progressive build, with its size:
// bun --env-file=<stack .env> benchmark/tools/subset-requests.ts <baseURL> <path>...
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
  const start = performance.now();
  const lines: Array<string> = [];
  const pending: Array<Promise<void>> = [];
  page.on("response", (response) => {
    if (!response.url().includes("_serverFn")) return;
    const body = response.request().postData() ?? "";
    // The request is seroval: an object is { p: { k: keys, v: values } }, and { t: 2 } is undefined
    type TNode = { t?: number; s?: unknown; p?: { k: Array<string>; v: Array<TNode> } };
    const find = (node: unknown): TNode | undefined => {
      if (node === null || typeof node !== "object") return undefined;
      const { p } = node as TNode;
      if (p?.k.includes("table") === true) return node as TNode;
      return Object.values(node).map(find).find((found) => found !== undefined);
    };
    const request = find(body === "" ? null : JSON.parse(body));
    if (request?.p === undefined) return;
    const field = (key: string) => request.p!.v[request.p!.k.indexOf(key)];
    const table = String(field("table").s);
    const limit = field("limit").t === 2 ? undefined : String(field("limit").s);
    const hasWhere = field("where").t !== 2;
    pending.push(
      response
        .body()
        .then((text) => {
          lines.push(
            `${String(Math.round(performance.now() - start)).padStart(5)} ms ${String(Math.round(text.length / 1024)).padStart(6)} KB  ${table.padEnd(26)} ${hasWhere ? "where" : "     "} ${limit === undefined ? "" : `limit ${limit}`}  ${body.length > 2000 ? `[${Math.round(body.length / 1024)} KB request]` : ""}`,
          );
        })
        .catch(() => undefined),
    );
  });
  await page.goto(path, { waitUntil: "commit" });
  await page.waitForTimeout(7000);
  await Promise.all(pending);
  console.log(`\n=== ${path}`);
  for (const line of lines.sort()) console.log(line);
  await context.close();
}
await browser.close();
