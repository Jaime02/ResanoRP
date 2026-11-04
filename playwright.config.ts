import { defineConfig, devices } from "@playwright/test";

import { APP_TIME_ZONE } from "./src/lib/dates";

if (process.env.VITE_HOST === undefined) {
  throw new Error("VITE_HOST environment variable is not set");
}

if (process.env.VITE_CADDY_HTTPS_PORT === undefined) {
  throw new Error("VITE_CADDY_HTTPS_PORT environment variable is not set");
}

const baseURL = `https://${process.env.VITE_HOST}:${process.env.VITE_CADDY_HTTPS_PORT}`;

export default defineConfig({
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  reporter: [["line"]],
  testDir: "./src/tests/e2e",
  // Each test goes through a whole feature in steps, sharing its database
  timeout: 3 * 60 * 1000, // 3 minutes
  use: {
    actionTimeout: 10 * 1000,
    navigationTimeout: 15 * 1000,
    baseURL,
    ignoreHTTPSErrors: true,
    // The clock the tests install replaces Date, whose subclasses then lose their prototype, so the time zone aware
    // dates of @date-fns/tz act as dates of the browser's time zone. The users' browsers are in Spain anyway
    timezoneId: APP_TIME_ZONE,
  },
  webServer: {
    // Playwright treats an exiting webServer as a crash, but `test:up` exits as
    // soon as the URL answers. `test:serve` brings the stack up and then follows
    // the app log, which keeps the process alive and surfaces server errors here.
    command: "bun run test:serve",
    reuseExistingServer: true,
    stdout: "pipe",
    url: baseURL,
    ignoreHTTPSErrors: true,
    timeout: 4 * 60 * 1000, // 4 minutes
  },
  workers: 1,
});
