import { createServerFn } from "@tanstack/react-start";
import { deleteCookie, getRequestIP, setCookie } from "@tanstack/react-start/server";
import { z } from "zod";

import { AppContextStorage } from "@/contexts/app-context-storage";
import { ADMIN_SESSION_COOKIE_NAME, getAdminSessionToken } from "@/lib/admin-session";

const MAX_FAILED_LOGINS = 5;
const FAILED_LOGINS_WINDOW_MS = 60_000;
// shortcut: counted in the memory of this process, so a restart clears it; move to the database if the server is ever replicated
const failedLogins = new Map<string, { count: number; windowEndsAt: number }>();

export const loginAdminFn = createServerFn({
  method: "POST",
})
  .validator((data: unknown) => z.string().parse(data))
  .handler(({ data }) => {
    const ip = getRequestIP({ xForwardedFor: true }) ?? "unknown";
    const now = Date.now();
    let failedLogin = failedLogins.get(ip);
    if (failedLogin === undefined || failedLogin.windowEndsAt <= now) {
      failedLogin = { count: 0, windowEndsAt: now + FAILED_LOGINS_WINDOW_MS };
      failedLogins.set(ip, failedLogin);
    }
    if (failedLogin.count >= MAX_FAILED_LOGINS) return false;

    const token = getAdminSessionToken(data);
    if (token === undefined) {
      failedLogin.count++;
      return false;
    }
    failedLogins.delete(ip);
    setCookie(ADMIN_SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      maxAge: AppContextStorage.COOKIE_MAX_AGE_SECONDS,
      path: "/",
      sameSite: "lax",
      secure: true,
    });
    return true;
  });

export const logoutAdminFn = createServerFn({
  method: "POST",
}).handler(() => {
  deleteCookie(ADMIN_SESSION_COOKIE_NAME, { path: "/" });
});
