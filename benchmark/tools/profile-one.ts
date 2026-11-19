// bun --env-file=<env> profile-one.ts <baseURL> <path> <out.cpuprofile>
import { writeFileSync } from "node:fs";

import { chromium } from "@playwright/test";

import { AppContextStorage, UserMode } from "@/contexts/app-context";
import { ADMIN_SESSION_COOKIE_NAME, getAdminSessionToken } from "@/lib/admin-session";

const [baseURL, path, out] = process.argv.slice(2);
const browser = await chromium.launch();
const context = await browser.newContext({ baseURL, ignoreHTTPSErrors: true });
await context.addCookies([
  AppContextStorage.testCookie(baseURL, UserMode.Admin),
  { httpOnly: true, name: ADMIN_SESSION_COOKIE_NAME, sameSite: "Lax", secure: true, url: baseURL, value: getAdminSessionToken(process.env.ADMIN_PASSWORD!)! },
]);
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send("Profiler.enable");
await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
await cdp.send("Profiler.start");
const start = Date.now();
await page.goto(path, { waitUntil: "commit" });
await page.waitForFunction(
  () =>
    document.querySelector("table[data-row-count]") !== null &&
    document.querySelector(":not([inert]) > table [data-testid='tr-skeleton']") === null,
  undefined,
  { polling: "raf", timeout: 60_000 },
);
const elapsed = Date.now() - start;
const { profile } = await cdp.send("Profiler.stop");
writeFileSync(out, JSON.stringify(profile));

type Node = { id: number; callFrame: { functionName: string; url: string; lineNumber: number }; children?: number[] };
const nodes = new Map<number, Node>(profile.nodes.map((n: Node) => [n.id, n]));
const self = new Map<string, number>();
const dt = profile.timeDeltas as number[];
profile.samples.forEach((id: number, i: number) => {
  const n = nodes.get(id)!;
  const key = `${n.callFrame.functionName || "(anon)"} ${n.callFrame.url.split("/").slice(-2).join("/").split("?")[0]}:${n.callFrame.lineNumber}`;
  self.set(key, (self.get(key) ?? 0) + (dt[i] ?? 0) / 1000);
});
// Group by file too
const byFile = new Map<string, number>();
for (const [key, ms] of self) {
  const file = key.split(" ").at(-1)!.split(":")[0]!;
  byFile.set(file, (byFile.get(file) ?? 0) + ms);
}
console.log(`elapsed until data ${elapsed} ms`);
console.log([...self].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, v]) => `${v.toFixed(0).padStart(6)} ${k}`).join("\n"));
console.log("--- by file");
console.log([...byFile].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([k, v]) => `${v.toFixed(0).padStart(6)} ${k}`).join("\n"));
await browser.close();
