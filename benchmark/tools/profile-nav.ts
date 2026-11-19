// bun --env-file=<env> profile-nav.ts <baseURL> <warm path> <other path> <out.cpuprofile>
import { writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import { AppContextStorage, UserMode } from "@/contexts/app-context";
import { ADMIN_SESSION_COOKIE_NAME, getAdminSessionToken } from "@/lib/admin-session";
const [baseURL, path, other, out] = process.argv.slice(2);
const browser = await chromium.launch();
const context = await browser.newContext({ baseURL, ignoreHTTPSErrors: true });
await context.addCookies([AppContextStorage.testCookie(baseURL, UserMode.Admin), { httpOnly: true, name: ADMIN_SESSION_COOKIE_NAME, sameSite: "Lax", secure: true, url: baseURL, value: getAdminSessionToken(process.env.ADMIN_PASSWORD!)! }]);
const page = await context.newPage();
const ready = () => page.waitForFunction(() => document.querySelector("table[data-row-count]") !== null && document.querySelector(":not([inert]) > table [data-testid='tr-skeleton']") === null, undefined, { polling: "raf", timeout: 60_000 });
const nav = (href: string) => page.evaluate((href) => { void (window as any).__TSR_ROUTER__.navigate({ href }); }, href);
await page.goto(path); await ready(); await page.waitForTimeout(3000);
await nav(other); await page.waitForTimeout(500); await ready(); await page.waitForTimeout(3000);
const cdp = await context.newCDPSession(page);
await cdp.send("Profiler.enable"); await cdp.send("Profiler.setSamplingInterval", { interval: 100 }); await cdp.send("Profiler.start");
const t = Date.now();
await nav(path); await page.waitForFunction((p) => location.pathname === p, path); await ready();
const elapsed = Date.now() - t;
await page.waitForTimeout(300);
const { profile } = await cdp.send("Profiler.stop");
writeFileSync(out, JSON.stringify(profile));
type N = { id: number; callFrame: { functionName: string; url: string; lineNumber: number }; children?: number[] };
const nodes = new Map<number, N>(profile.nodes.map((n: N) => [n.id, n]));
const parent = new Map<number, number>(); for (const n of profile.nodes as N[]) for (const c of n.children ?? []) parent.set(c, n.id);
const self = new Map<string, number>(); const total = new Map<string, number>();
const name = (n: N) => `${n.callFrame.functionName || "(anon)"} ${n.callFrame.url.split("/").slice(-2).join("/").split("?")[0]}:${n.callFrame.lineNumber}`;
profile.samples.forEach((id: number, i: number) => {
  const ms = (profile.timeDeltas[i] ?? 0) / 1000;
  self.set(name(nodes.get(id)!), (self.get(name(nodes.get(id)!)) ?? 0) + ms);
  const seen = new Set<string>(); let cur: number | undefined = id;
  while (cur !== undefined) { const k = name(nodes.get(cur)!); if (!seen.has(k)) { seen.add(k); total.set(k, (total.get(k) ?? 0) + ms); } cur = parent.get(cur); }
});
console.log(`navigation to data: ${elapsed} ms`);
console.log("--- self"); console.log([...self].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => `${v.toFixed(0).padStart(6)} ${k}`).join("\n"));
console.log("--- total (inclusive)"); console.log([...total].sort((a, b) => b[1] - a[1]).slice(0, 45).map(([k, v]) => `${v.toFixed(0).padStart(6)} ${k}`).join("\n"));
await browser.close();
