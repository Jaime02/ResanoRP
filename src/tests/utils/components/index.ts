import { expect } from "@playwright/test";
import type { Locator, Page, Request } from "@playwright/test";

export async function getTestId(element: Locator): Promise<number> {
  const idAttribute = await element.getAttribute("data-testid");
  if (idAttribute === null) {
    throw new Error("Element does not have a data-testid attribute");
  }
  return parseInt(idAttribute, 10);
}

// Electric drops a change still in flight when an on-demand subset snapshot is requested, so a test writing to the
// database waits for the snapshots to settle first
// TODO: https://github.com/electric-sql/electric/issues/4847
export function trackSubsetSnapshots(page: Page) {
  const pendingSnapshots = new Set<Request>();
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname.startsWith("/api/models/")) {
      pendingSnapshots.add(request);
    }
  });
  page.on("requestfinished", (request) => pendingSnapshots.delete(request));
  page.on("requestfailed", (request) => pendingSnapshots.delete(request));
  // A request the previous document sent while unloading is cancelled without a requestfailed event
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) {
      pendingSnapshots.clear();
    }
  });
  return async () => expect.poll(() => pendingSnapshots.size).toBe(0);
}

// An element shown only for a moment is gone before an assertion can find it, so its insertions are counted instead
export async function countTestIdInsertions(page: Page, testId: string) {
  const insertions = await page.evaluateHandle((testId) => {
    const selector = `[data-testid="${testId}"]`;
    const counter = { count: 0 };
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof Element && (node.matches(selector) || node.querySelector(selector) !== null)) {
            counter.count++;
          }
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
    return counter;
  }, testId);
  return async () => insertions.evaluate((counter) => counter.count);
}
