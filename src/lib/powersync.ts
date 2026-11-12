import { getTableColumns, getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";

import * as dbSchema from "@/db/schema";
import { formatClientError } from "@/lib/formatters";
import { PowerSyncClient } from "@/lib/powersync-lite/client";
import { getPowerSyncTokenFn } from "@/lib/powersync-token-fns";
import log from "@/logging/log";
import { LogMessages, LoggerLevels } from "@/logging/types";

// Caddy serves PowerSync under this path of the app origin, see docker/Caddyfile
const POWERSYNC_PATH = "/powersync";
// Longer than the first retries, which start at one second and double
const SYNC_ERROR_GRACE_MS = 5_000;
// More than the 30 seconds before expiry at which the sync stream reconnects, so that reconnect gets a new token
const TOKEN_RENEW_MARGIN_MS = 60_000;
// The checkpoint arrives once the reconnect after a storage reset has downloaded every table again
const RECONNECT_CHECKPOINT_TIMEOUT_MS = 60_000;

const keepValue = (value: unknown) => value;

// PowerSync sends the values as SQLite types: booleans as 0/1, numerics and timestamps as text, the timestamps with a
// space before the time, and `id` as text
const FROM_POWERSYNC: Partial<Record<string, (value: unknown) => unknown>> = {
  PgBoolean: (value) => value !== 0,
  PgInteger: Number,
  PgNumeric: keepValue,
  PgText: keepValue,
  PgTimestamp: (value) => {
    const date = new Date(String(value).replace(" ", "T"));
    if (Number.isNaN(date.getTime())) {
      throw new Error(`Invalid timestamp ${String(value)}`);
    }
    return date;
  },
};

export type TPowerSyncRow = Record<string, unknown>;

// Derived from the Drizzle schema, so a new column only has to be added there. A new table also needs a stream in
// docker/powersync/sync-config.yaml named after it, or its collection never loads
const tables = new Map<string, (row: TPowerSyncRow) => Record<string, unknown>>(
  Object.values(dbSchema)
    .filter((value) => is(value, PgTable))
    .map((dbTable) => {
      const columns = Object.entries(getTableColumns(dbTable)).map(([key, dbColumn]) => {
        const convert = FROM_POWERSYNC[dbColumn.columnType];
        if (convert === undefined) {
          throw new Error(`Column ${dbColumn.name} has the type ${dbColumn.columnType}, which PowerSync does not sync`);
        }
        return { key, name: dbColumn.name, convert };
      });
      return [
        getTableName(dbTable),
        (row: TPowerSyncRow) =>
          Object.fromEntries(
            columns.map(({ key, name, convert }) => {
              const value = row[name];
              return [key, value === null || value === undefined ? null : convert(value)];
            }),
          ),
      ] as const;
    }),
);

export function getToAppRow(table: string) {
  const toAppRow = tables.get(table);
  if (toAppRow === undefined) {
    throw new Error(`The Drizzle schema has no table ${table}`);
  }
  return toAppRow;
}

let cachedToken: { token: string; renewAt: number } | undefined;

// One token per lifetime instead of a server call on every mutation and reconnect. Timed with the browser's clock,
// so a skewed clock cannot keep an expired token
async function getToken(): Promise<string> {
  if (cachedToken === undefined || Date.now() >= cachedToken.renewAt) {
    const { expiresInSeconds, token } = await getPowerSyncTokenFn();
    cachedToken = { renewAt: Date.now() + expiresInSeconds * 1000 - TOKEN_RENEW_MARGIN_MS, token };
  }
  return cachedToken.token;
}

// A failed request may have been a rejected token, so the next one gets a new token
export function forgetPowerSyncToken() {
  cachedToken = undefined;
}

let client: PowerSyncClient | undefined;

// Created on first use, so a server render never connects
export function getPowerSyncClient(): PowerSyncClient {
  if (client === undefined) {
    const powerSyncClient = new PowerSyncClient({
      endpoint: `${window.location.origin}${POWERSYNC_PATH}`,
      getToken,
    });
    // The client keeps retrying, and reports the error again on every attempt until one succeeds. Leaving the page
    // breaks off the stream while it is read, so an error only counts once the client has not recovered for a while
    let lastSyncError: string | undefined;
    let pendingSyncError: ReturnType<typeof setTimeout> | undefined;
    let reconnecting = false;
    powerSyncClient.subscribeStatus(() => {
      const { state, error } = powerSyncClient.status;
      if (state === "ready") lastSyncError = undefined;
      if (state === "ready" || state === "idle") {
        clearTimeout(pendingSyncError);
        pendingSyncError = undefined;
      }
      // The service may have restarted with its storage reset (start.cmd import), losing the checkpoint this tab still
      // waits for since its last save, and then it would never apply another change. A new checkpoint replaces it
      if (state === "syncing" && reconnecting) {
        reconnecting = false;
        void powerSyncClient
          .confirmWrites({ signal: AbortSignal.timeout(RECONNECT_CHECKPOINT_TIMEOUT_MS) })
          .catch(() => undefined);
      }
      if (error === undefined) return;
      reconnecting = true;
      forgetPowerSyncToken();
      if (pendingSyncError !== undefined) return;
      pendingSyncError = setTimeout(() => {
        pendingSyncError = undefined;
        const { state: currentState, error: currentError = error } = powerSyncClient.status;
        // Connected again, it is only still downloading
        if (currentState === "syncing" || currentState === "ready" || currentState === "idle") return;
        if (currentError.message === lastSyncError) return;
        lastSyncError = currentError.message;
        void log(LoggerLevels.error, LogMessages.powerSyncSyncFailed, formatClientError(currentError));
      }, SYNC_ERROR_GRACE_MS);
    });
    client = powerSyncClient;
  }
  return client;
}
