import { createServerFn } from "@tanstack/react-start";
import { deleteCookie, getCookie, getRequestIP, setCookie } from "@tanstack/react-start/server";
import { z } from "zod";

import { AppContextStorage } from "@/contexts/app-context-storage";
import { AdminLoginResult, createAdminLoginThrottle } from "@/lib/admin-login";
import { ADMIN_SESSION_COOKIE_NAME, getAdminSessionToken, isAdminSession } from "@/lib/admin-session";
import { ADMIN_LOGIN_ERROR_CODES, ADMIN_SESSION_AUDIT_PATHS, writeAuditEntry } from "@/logging/audit";

const throttleAdminLogin = createAdminLoginThrottle();

export const loginAdminFn = createServerFn({
  method: "POST",
})
  .validator((data: unknown) => z.string().parse(data))
  .handler(async ({ data }) => {
    const ip = getRequestIP({ xForwardedFor: true }) ?? "unknown";
    const token = getAdminSessionToken(data);
    const result = throttleAdminLogin(ip, Date.now(), token !== undefined);
    if (token === undefined || result !== AdminLoginResult.Ok) {
      await writeAuditEntry({
        path: ADMIN_SESSION_AUDIT_PATHS.login,
        ok: false,
        ip,
        errorCode:
          result === AdminLoginResult.Locked ? ADMIN_LOGIN_ERROR_CODES.locked : ADMIN_LOGIN_ERROR_CODES.wrongPassword,
      });
      return result;
    }
    setCookie(ADMIN_SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      maxAge: AppContextStorage.COOKIE_MAX_AGE_SECONDS,
      path: "/",
      sameSite: "lax",
      secure: true,
    });
    await writeAuditEntry({ path: ADMIN_SESSION_AUDIT_PATHS.login, ok: true, ip });
    return result;
  });

export const logoutAdminFn = createServerFn({
  method: "POST",
}).handler(async () => {
  // Every pick of another user mode calls it, with or without a session, and only closing one is worth an entry
  if (!isAdminSession(getCookie(ADMIN_SESSION_COOKIE_NAME))) {
    return;
  }
  deleteCookie(ADMIN_SESSION_COOKIE_NAME, { path: "/" });
  await writeAuditEntry({
    path: ADMIN_SESSION_AUDIT_PATHS.logout,
    ok: true,
    ip: getRequestIP({ xForwardedFor: true }),
  });
});
