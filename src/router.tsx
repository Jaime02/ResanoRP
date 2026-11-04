import { DbClient } from "@tanstack/react-db";
import { createRouter } from "@tanstack/react-router";
import { routerWithDbClient } from "@tanstack/react-router-with-db";

import NotFound from "@/components/home/NotFound";
import type { UserMode } from "@/contexts/app-context-storage";

import { routeTree } from "./routeTree.gen";

// Called once per request on the server and once in the browser, so each gets its own DbClient
export function getRouter() {
  const dbClient = new DbClient();
  return routerWithDbClient(
    createRouter({
      context: { dbClient },
      defaultNotFoundComponent: NotFound,
      // Dialogs open through search params, so keying by pathname keeps the scroll instead of jumping to the top
      getScrollRestorationKey: (location) => location.pathname,
      routeTree,
      scrollRestoration: true,
      scrollToTopSelectors: ["#main"],
    }),
    dbClient,
  );
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
  interface StaticDataRouteOption {
    // A page without it opens for every user mode
    userModes?: Array<UserMode>;
  }
}
