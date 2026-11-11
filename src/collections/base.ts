import type { PowerSyncDatabase } from "@powersync/web";
import { powerSyncCollectionOptions as powerSyncSyncOptions } from "@tanstack/powersync-db-collection";
import type { PowerSyncCollectionConfig, PowerSyncCollectionUtils } from "@tanstack/powersync-db-collection";
import { BasicIndex, collectionOptions } from "@tanstack/react-db";
import type { CollectionConfig, CollectionOptions, DbClient, NonSingleResult, SyncConfig } from "@tanstack/react-db";
import type { z } from "zod";

import { getPowerSyncDatabase, getPowerSyncTable } from "@/lib/powersync";
import type { TSQLiteRow, TTableName } from "@/lib/powersync";
import log from "@/logging/log";
import { LogMessages, LoggerLevels } from "@/logging/types";

export type TPowerSyncCollection = CollectionOptions<any, any, any, PowerSyncCollectionUtils> & NonSingleResult;

const SYNC_TIMEOUT_MS = 10_000;
const SYNC_POLL_MS = 20;
const SYNC_RETRY_MS = 100;

// The tables where the diff triggers of this tab's collections queue the synced changes they have not applied yet
const trackedTableNames = new Set<string>();

function baseCollectionOptions(table: TTableName) {
  return {
    id: `"${table}"`,
    defaultIndexType: BasicIndex,
    // A DbClient creates its Collections without any hook to add indexes to them, so each query creates the ones it
    // needs when it compiles
    autoIndex: "eager" as const,
    table,
  };
}

type TPowerSyncOptions<TSchema extends z.ZodType<object>, TKey extends string | number> = ReturnType<
  typeof baseCollectionOptions
> &
  // Eager only: SQLite already holds every row, and each on-demand subset load rebuilds the collection's diff triggers
  Omit<
    CollectionConfig<z.output<TSchema>, TKey, TSchema, PowerSyncCollectionUtils>,
    "id" | "startSync" | "sync" | "syncMode" | "utils"
  > & {
    schema: TSchema;
  };

/**
 * Syncs the collection from the PowerSync SQLite database, but keeps the app's own schema, key and mutation handlers:
 * every write goes through tRPC instead of PowerSync's upload queue, so the server can still reject it
 */
export function powerSyncCollectionOptions<TSchema extends z.ZodType<object>, TKey extends string | number>({
  table,
  ...config
}: TPowerSyncOptions<TSchema, TKey>): CollectionConfig<z.output<TSchema>, TKey, TSchema, PowerSyncCollectionUtils> & {
  utils: PowerSyncCollectionUtils;
} {
  const { table: powerSyncTable, toAppRow } = getPowerSyncTable(table);
  const database = getPowerSyncDatabase();
  // A collection is ready once it has read SQLite, which a new browser has not filled yet and a later page load filled
  // with the rows of the previous one, so its queries would show no rows or stale ones instead of loading
  // Typed as a plain SQLite collection: its types want an `id` in the app schema, which the tables keyed by other
  // columns do not have
  const { startSync, sync, utils } = powerSyncSyncOptions({
    database,
    table: powerSyncTable,
    onLoad: async () => {
      await catchUp(database);
    },
    // PowerSync keys the collection by the row id, so a table keyed by other columns takes its id from getKey
    deserializationSchema: {
      "~standard": {
        validate: (row: TSQLiteRow) => {
          const value = toAppRow(row) as z.output<TSchema>;
          return { value: { ...value, id: config.getKey(value) } };
        },
        vendor: "resanorp",
        version: 1,
      },
    },
  } as unknown as PowerSyncCollectionConfig);
  trackedTableNames.add(utils.getMeta().trackedTableName);
  return { ...config, startSync, sync: sync as unknown as SyncConfig<z.output<TSchema>, TKey>, utils };
}

// Each DbClient materializes its own Collection from the descriptor. Only the browser's does: the server renders no
// component that reads one
export function powerSyncCollection<TConfig extends CollectionConfig<any, any, any, any>>(
  table: TTableName,
  createConfig: (baseOptions: ReturnType<typeof baseCollectionOptions>, dbClient: DbClient) => TConfig,
) {
  return collectionOptions(`"${table}"`, (dbClient) => createConfig(baseCollectionOptions(table), dbClient));
}

/**
 * Waits until the PowerSync database holds every row the server had committed when it was called, until the signal
 * aborts
 */
async function syncCheckpoint(database: PowerSyncDatabase, signal: AbortSignal) {
  const aborted = new Promise<never>((_, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
  for (;;) {
    try {
      // requestCheckpoint takes no signal, and waits for as long as the sync stream cannot connect
      const checkpoint = await Promise.race([database.requestCheckpoint(), aborted]);
      await checkpoint.waitForSync({ signal });
      return;
    } catch {
      // Both reject while the client is still connecting after a page load, and while it waits to reconnect after an
      // error, which the status listener of the database already logs
      signal.throwIfAborted();
      await new Promise((resolve) => setTimeout(resolve, SYNC_RETRY_MS));
    }
  }
}

let caughtUp: Promise<void> | undefined;

// Once per page load: later collections read the rows the sync stream keeps up to date from then on
async function catchUp(database: PowerSyncDatabase) {
  caughtUp ??= (async () => {
    await database.waitForFirstSync();
    // Without the server, the rows of the previous page load are better than none
    await syncCheckpoint(database, AbortSignal.timeout(SYNC_TIMEOUT_MS)).catch(() => undefined);
  })();
  return caughtUp;
}

async function hasUnappliedChanges(database: PowerSyncDatabase): Promise<boolean> {
  const names = [...trackedTableNames];
  // One snapshot, as a collection can drop its tracking table between both queries
  return database.readTransaction(async (context) => {
    // A collection that is not syncing has dropped its tracking table
    const tables = await context.getAll<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${names.map(() => "?").join(", ")})`,
      names,
    );
    if (tables.length === 0) return false;
    const { unapplied } = await context.get<{ unapplied: number }>(
      `SELECT ${tables.map(({ name }) => `EXISTS (SELECT 1 FROM ${name})`).join(" OR ")} AS unapplied`,
    );
    return unapplied === 1;
  });
}

/**
 * Waits until the collections show what the server has committed so far. A mutation handler awaits it after its tRPC
 * call, so its optimistic rows are swapped for the synced ones without showing the old rows in between.
 *
 * One checkpoint covers every table, whichever ones the mutation wrote.
 */
export async function awaitSynced() {
  const database = getPowerSyncDatabase();
  const signal = AbortSignal.timeout(SYNC_TIMEOUT_MS);
  try {
    await syncCheckpoint(database, signal);
    // The synced rows are already in SQLite, but its diff triggers only hand them to the collections on a throttled
    // change notification. Polled, because emptying a tracking table is a `DELETE` without `WHERE`, which SQLite
    // truncates without notifying any change
    while (await hasUnappliedChanges(database)) {
      signal.throwIfAborted();
      await new Promise((resolve) => setTimeout(resolve, SYNC_POLL_MS));
    }
  } catch (error) {
    if (!signal.aborted) throw error;
    // The server already committed the mutation, so failing here would report an error for a saved change and invite a
    // retry that saves it twice. The synced rows still arrive on their own
    void log(LoggerLevels.warning, LogMessages.powerSyncSyncTimedOut);
  }
}
