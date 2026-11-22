import { createFileRoute } from "@tanstack/react-router";
import { getCookie, getRequestIP } from "@tanstack/react-start/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

import db from "@/db";
import { ADMIN_SESSION_COOKIE_NAME, isAdminSession } from "@/lib/admin-session";
import { appRouter } from "@/trpc/app-router";
import { TRPC_URL } from "@/trpc/trpc-client";

export type AppRouter = typeof appRouter;

async function serve({ request }: { request: Request }) {
  return fetchRequestHandler({
    endpoint: TRPC_URL,
    req: request,
    router: appRouter,
    createContext: async () => ({
      db,
      cookie: request.headers.get("cookie"),
      isAdmin: isAdminSession(getCookie(ADMIN_SESSION_COOKIE_NAME)),
      ip: getRequestIP({ xForwardedFor: true }),
    }),
  });
}

export const Route = createFileRoute(`/api/trpc/$`)({
  server: {
    handlers: {
      GET: serve,
      POST: serve,
    },
  },
});
