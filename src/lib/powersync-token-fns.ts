import { createServerFn } from "@tanstack/react-start";

import { createPowerSyncToken } from "@/lib/powersync-token";

export const getPowerSyncTokenFn = createServerFn().handler(() => createPowerSyncToken());
