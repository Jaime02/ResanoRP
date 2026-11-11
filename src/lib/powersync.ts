import { PowerSyncDatabase, Schema, Table, WASQLiteVFS, column } from "@powersync/web";
import type { PowerSyncBackendConnector } from "@powersync/web";
import { getTableColumns, getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";

import * as dbSchema from "@/db/schema";
import { formatClientError } from "@/lib/formatters";
import { getPowerSyncTokenFn } from "@/lib/powersync-token-fns";
import log from "@/logging/log";
import { LogMessages, LoggerLevels } from "@/logging/types";

// Caddy serves PowerSync under this path of the app origin, see docker/Caddyfile
const POWERSYNC_PATH = "/powersync";

const SQLITE_COLUMN_TYPES = {
  PgBoolean: column.integer,
  PgInteger: column.integer,
  PgNumeric: column.text,
  PgText: column.text,
  PgTimestamp: column.text,
};

// Booleans arrive as 0/1, timestamps as text with a space before the time, and `id` as text
const FROM_SQLITE: Partial<Record<keyof typeof SQLITE_COLUMN_TYPES, (value: unknown) => unknown>> = {
  PgBoolean: (value) => value !== 0,
  PgInteger: Number,
  PgTimestamp: (value) => new Date(String(value).replace(" ", "T")),
};

export type TSQLiteRow = Record<string, unknown>;

// Derived from the Drizzle schema, so a new column only has to be added there. A new table also needs a query in
// docker/powersync/sync-config.yaml, or its collection stays empty
const tables = new Map(
  Object.values(dbSchema)
    .filter((value) => is(value, PgTable))
    .map((dbTable) => {
      const columns = Object.entries(getTableColumns(dbTable)).map(([key, dbColumn]) => {
        if (!(dbColumn.columnType in SQLITE_COLUMN_TYPES)) {
          throw new Error(`Column ${dbColumn.name} has the type ${dbColumn.columnType}, which PowerSync does not sync`);
        }
        return { key, name: dbColumn.name, type: dbColumn.columnType as keyof typeof SQLITE_COLUMN_TYPES };
      });
      return [
        getTableName(dbTable),
        {
          // PowerSync adds the text `id` column itself
          table: new Table(
            Object.fromEntries(
              columns.filter(({ name }) => name !== "id").map(({ name, type }) => [name, SQLITE_COLUMN_TYPES[type]]),
            ),
          ),
          toAppRow: (row: TSQLiteRow) =>
            Object.fromEntries(
              columns.map(({ key, name, type }) => {
                const value = row[name];
                const convert = FROM_SQLITE[type];
                return [key, value === null || convert === undefined ? value : convert(value)];
              }),
            ),
        },
      ] as const;
    }),
);

const schema = new Schema(Object.fromEntries([...tables].map(([name, { table }]) => [name, table])));

export type TTableName = typeof tables extends Map<infer TName, unknown> ? TName : never;

export function getPowerSyncTable(name: TTableName) {
  const table = tables.get(name);
  if (table === undefined) {
    throw new Error(`The Drizzle schema has no table ${name}`);
  }
  // The Schema names a copy of each table, the one the collection has to read
  return { ...table, table: schema.props[name] };
}

const connector: PowerSyncBackendConnector = {
  fetchCredentials: async () => ({
    endpoint: `${window.location.origin}${POWERSYNC_PATH}`,
    token: await getPowerSyncTokenFn(),
  }),
  // Every write goes through tRPC, so the local database never has changes to upload
  uploadData: async () => {},
};

let database: PowerSyncDatabase | undefined;

// Created on first use, so a server render never opens it
export function getPowerSyncDatabase(): PowerSyncDatabase {
  if (database === undefined) {
    database = new PowerSyncDatabase({
      // OPFSCoopSyncVFS is the one PowerSync recommends for several open tabs
      database: { dbFilename: "resanorp.sqlite", vfs: WASQLiteVFS.OPFSCoopSyncVFS },
      schema,
    });
    // connect() resolves even when syncing fails: it keeps retrying, and the status repeats the error until a sync
    // succeeds
    let lastSyncError: string | undefined;
    database.registerListener({
      statusChanged: ({ downloadError }) => {
        if (downloadError?.message === lastSyncError) return;
        lastSyncError = downloadError?.message;
        if (downloadError !== undefined) {
          void log(LoggerLevels.error, LogMessages.powerSyncSyncFailed, formatClientError(downloadError));
        }
      },
    });
    // requestCheckpoint needs this mode, see awaitSynced in src/collections/base.ts
    database.connect(connector, { checkpointMode: "requests" }).catch(async (error: unknown) => {
      await log(LoggerLevels.error, LogMessages.powerSyncSyncFailed, formatClientError(error));
    });
  }
  return database;
}
