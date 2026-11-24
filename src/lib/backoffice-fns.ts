import fs from "node:fs/promises";

import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";

import { ADMIN_SESSION_COOKIE_NAME, isAdminSession } from "@/lib/admin-session";
import { BACKOFFICE_MAX_LINES } from "@/lib/backoffice";
import { errorsLogFilePath } from "@/logging/logger";
import { ADMIN_ONLY_MESSAGE } from "@/messages/common";

export const getErrorsLogFn = createServerFn().handler(async () => {
  if (!isAdminSession(getCookie(ADMIN_SESSION_COOKIE_NAME))) {
    throw new Error(ADMIN_ONLY_MESSAGE);
  }
  const content = await fs.readFile(errorsLogFilePath, "utf-8").catch(() => "");
  return content.split("\n").filter(Boolean).slice(-BACKOFFICE_MAX_LINES).reverse();
});

export const clearErrorsLogFn = createServerFn({ method: "POST" }).handler(async () => {
  if (!isAdminSession(getCookie(ADMIN_SESSION_COOKIE_NAME))) {
    throw new Error(ADMIN_ONLY_MESSAGE);
  }
  // Truncated, not removed: the logger keeps appending to the same file
  await fs.truncate(errorsLogFilePath, 0);
});
