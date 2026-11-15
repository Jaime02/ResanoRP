import { createServerFn } from "@tanstack/react-start";

import { createPowerSyncToken, POWERSYNC_TOKEN_LIFETIME_SECONDS } from "@/lib/powersync-token";

export const getPowerSyncTokenFn = createServerFn().handler(() => ({
  expiresInSeconds: POWERSYNC_TOKEN_LIFETIME_SECONDS,
  token: createPowerSyncToken(),
}));
