import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { ToastType } from "@/types";

interface TExpectedToast {
  type: ToastType;
  message?: string;
}

// A string is the message of an error toast, and without anything the toast has to be a success one
export async function expectSingleToast(page: Page, expected: string | TExpectedToast = { type: ToastType.Success }) {
  const { type, message } = typeof expected === "string" ? { message: expected, type: ToastType.Error } : expected;
  const toasts = getToasts(page);
  await expect(toasts).toHaveCount(1);
  expect(await getToastType(toasts.first())).toBe(type);
  if (message !== undefined) {
    await expect(toasts.first()).toContainText(message);
  }
  await clearToasts(page);
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
