import { createServerFn } from "@tanstack/react-start";
import { getRequestIP } from "@tanstack/react-start/server";

// The same IP the audit log records, so the one an entry shows is the one to give a Usuario
export const getRequestIpFn = createServerFn().handler(() => getRequestIP({ xForwardedFor: true }) ?? null);
