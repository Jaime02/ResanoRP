import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { ERROR_TITLE } from "@/messages/common";
import { ToastType } from "@/types/toast";
import type { TToast } from "@/types/toast";

// A string is the description of the error toast shown when a mutation fails
export async function expectSingleToast(page: Page, expected: string | RegExp | Omit<TToast<string | RegExp>, "id">) {
  const { type, title, description } =
    typeof expected === "string" || expected instanceof RegExp
      ? { description: expected, title: ERROR_TITLE, type: ToastType.Error }
      : expected;
  const toasts = getToasts(page);
  await expect(toasts).toHaveCount(1);
  const toast = toasts.first();
  expect(await getToastType(toast)).toBe(type);
  await expect(toast.getByTestId("toast-title")).toHaveText(title);
  if (description !== undefined) {
    await expect(toast).toContainText(description);
  }
  await clearToasts(page);
}

export async function expectSingleSuccessToast(page: Page, title: string, description?: string) {
  await expectSingleToast(page, { description, title, type: ToastType.Success });
}

export function getToasts(page: Page): Locator {
  return page.getByTestId("toast-viewport").getByTestId("toast-root");
}

export async function getToastType(toast: Locator): Promise<string | null> {
  return toast.getAttribute("data-type");
}

export async function clearToasts(page: Page) {
  const toasts = getToasts(page);
  while ((await toasts.count()) > 0) {
    const toast = toasts.first();
    await toast.getByTestId("button-close").click();
    await expect(toast).not.toBeVisible();
  }
  await expect(toasts).toHaveCount(0);
}

export async function expectSingleSuccessOrErrorToast(page: Page, successTitle: string, expectedErrorMessage?: string) {
  await (expectedErrorMessage === undefined
    ? expectSingleSuccessToast(page, successTitle)
    : expectSingleToast(page, expectedErrorMessage));
}
