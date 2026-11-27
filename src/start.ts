import { createCsrfMiddleware, createStart } from "@tanstack/react-start";
import { z } from "zod";

import loggingMiddleware from "@/logging/middleware";
import { TRPC_URL } from "@/trpc/trpc-client";

z.config(z.locales.es());

const csrfMiddleware = createCsrfMiddleware({
  // The tRPC uploads send FormData, which a page on another port of the same host can post without a CORS preflight
  // and with the SameSite=Lax admin session cookie
  filter: (ctx) =>
    ctx.handlerType === "serverFn" ||
    (ctx.request.method !== "GET" && new URL(ctx.request.url).pathname.startsWith(TRPC_URL)),
});

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware, loggingMiddleware],
}));
