import type { Locator, Page } from "@playwright/test";

export async function getTestId(element: Locator): Promise<number> {
  const idAttribute = await element.getAttribute("data-testid");
  if (idAttribute === null) {
    throw new Error("Element does not have a data-testid attribute");
  }
  return parseInt(idAttribute, 10);
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
