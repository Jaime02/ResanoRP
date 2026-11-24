import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";

import { ADMIN_SESSION_COOKIE_NAME, isAdminSession } from "@/lib/admin-session";
import { createPowerSyncToken, POWERSYNC_TOKEN_LIFETIME_SECONDS } from "@/lib/powersync-token";

export const getPowerSyncTokenFn = createServerFn().handler(() => ({
  expiresInSeconds: POWERSYNC_TOKEN_LIFETIME_SECONDS,
  token: createPowerSyncToken(isAdminSession(getCookie(ADMIN_SESSION_COOKIE_NAME))),
}));
