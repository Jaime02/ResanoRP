import type { Page } from "@playwright/test";
import type { AnyTRPCProcedure, TRPCRouterRecord } from "@trpc/server";

import type { AppRouter } from "@/routes/api/trpc/$";

export type TProcedurePath<TRecord extends TRPCRouterRecord, TPrefix extends string = ""> = {
  [TKey in keyof TRecord & string]: TRecord[TKey] extends AnyTRPCProcedure
    ? `${TPrefix}${TKey}`
    : TRecord[TKey] extends TRPCRouterRecord
      ? TProcedurePath<TRecord[TKey], `${TPrefix}${TKey}.`>
      : never;
}[keyof TRecord & string];

interface HoldRequestWhileParams {
  page: Page;
  procedurePath: TProcedurePath<AppRouter["_def"]["record"]>;
  send: () => Promise<void>;
  meanwhile: () => Promise<void>;
}

// The page sends the request of the procedure from its UI, but the server only gets it once `meanwhile` is done, as if
// it were slower than a change made at the same time, like one from another tab. `send` can wait for the response, as
// it is only awaited once the request is released
export async function holdRequestWhile({ page, procedurePath, send, meanwhile }: HoldRequestWhileParams) {
  const url = `**/api/trpc/${procedurePath}*`;
  let release!: () => void;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    url,
    async (route) => {
      await released;
      await route.continue();
    },
    { times: 1 },
  );
  const request = page.waitForRequest(url);
  const sent = send();
  await request;
  await meanwhile();
  release();
  await sent;
}
