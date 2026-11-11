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

const keepValue = (value: unknown) => value;

// PowerSync sends the values as SQLite types: booleans as 0/1, numerics and timestamps as text, the timestamps with a
// space before the time, and `id` as text
const FROM_POWERSYNC: Partial<Record<string, (value: unknown) => unknown>> = {
  PgBoolean: (value) => value !== 0,
  PgInteger: Number,
  PgNumeric: keepValue,
  PgText: keepValue,
  PgTimestamp: (value) => new Date(String(value).replace(" ", "T")),
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

let client: PowerSyncClient | undefined;

// Created on first use, so a server render never connects
export function getPowerSyncClient(): PowerSyncClient {
  if (client === undefined) {
    const powerSyncClient = new PowerSyncClient({
      endpoint: `${window.location.origin}${POWERSYNC_PATH}`,
      getToken: async () => getPowerSyncTokenFn(),
    });
    // The client keeps retrying, and reports the error again on every attempt until one succeeds
    let lastSyncError: string | undefined;
    powerSyncClient.subscribeStatus(() => {
      const { state, error } = powerSyncClient.status;
      if (state === "ready") lastSyncError = undefined;
      if (error === undefined || error.message === lastSyncError) return;
      lastSyncError = error.message;
      void log(LoggerLevels.error, LogMessages.powerSyncSyncFailed, formatClientError(error));
    });
    client = powerSyncClient;
  }
  return client;
}
