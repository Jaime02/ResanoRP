import type { DbClient } from "@tanstack/react-db";
import { HeadContent, Outlet, Scripts, createRootRouteWithContext, redirect } from "@tanstack/react-router";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getCookie, setCookie } from "@tanstack/react-start/server";
import type { ReactNode } from "react";

import Login from "@/components/home/Login";
import Navbar from "@/components/ui/navbar";
import { ToastList } from "@/components/ui/toast";
import { AppContextProvider } from "@/contexts/app-context-provider";
import { AppContextStorage, UserMode } from "@/contexts/app-context-storage";
import { ADMIN_SESSION_COOKIE_NAME, isAdminSession } from "@/lib/admin-session";

import appCss from "./styles.css?url";

interface RouteContext {
  dbClient: DbClient;
  title?: string;
}

const getUserStateCookie = createIsomorphicFn()
  .server(() => {
    let userStateCookie = getCookie(AppContextStorage.COOKIE_NAME);
    // The user mode cookie is written by the browser, so only the admin session cookie proves the password was given
    const userState = AppContextStorage.parse(userStateCookie);
    if (userState.userMode === UserMode.Admin && !isAdminSession(getCookie(ADMIN_SESSION_COOKIE_NAME))) {
      userStateCookie = new AppContextStorage(undefined, userState.userModeMachineId).toJSON();
    }
    if (userStateCookie !== undefined) {
      // Renewed on every page load, so a Máquina that never changes its user mode does not lose it when it expires
      setCookie(AppContextStorage.COOKIE_NAME, userStateCookie, {
        maxAge: AppContextStorage.COOKIE_MAX_AGE_SECONDS,
        path: "/",
        sameSite: "lax",
      });
    }
    return userStateCookie;
  })
  .client(() => AppContextStorage.readCookie());

export const Route = createRootRouteWithContext<RouteContext>()({
  beforeLoad: ({ matches }) => {
    const userStateCookie = getUserStateCookie();
    const { userMode } = AppContextStorage.parse(userStateCookie);
    // Only keeps the pages out of sight, every admin change is checked again by the server
    if (
      matches.some(
        ({ staticData }) =>
          staticData.userModes !== undefined && (userMode === undefined || !staticData.userModes.includes(userMode)),
      )
    ) {
      throw redirect({ to: "/" });
    }
    return { userStateCookie };
  },
  component: RootComponent,
  shellComponent: RootDocument,
  head: () => ({
    links: [
      {
        href: appCss,
        rel: "stylesheet",
      },
      { color: "#fffff", href: "/site.webmanifest", rel: "manifest" },
      { href: "/favicon/favicon.ico", rel: "icon" },
    ],
    meta: [
      {
        charSet: "utf-8",
      },
      {
        content: "width=device-width, initial-scale=1",
        name: "viewport",
      },
      {
        title: "ResanoRP",
      },
    ],
  }),
});

function RootComponent() {
  return (
    <AppContextProvider>
      <Navbar />
      <div id="main" className="mx-auto flex w-full max-w-full grow flex-col gap-3 overflow-auto px-4 py-3">
        <Login>
          <Outlet />
        </Login>
      </div>
      <ToastList />
    </AppContextProvider>
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body className="h-screen bg-background text-foreground">
        <div className="isolate flex h-dvh flex-col">{children}</div>
        <Scripts />
      </body>
    </html>
  );
}
