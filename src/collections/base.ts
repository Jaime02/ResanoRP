import type { StreamSubscription, TableChanges } from "@powersync/standalone-client";
import { BasicIndex, collectionOptions, withPublicationContext } from "@tanstack/react-db";
import type {
  ChangeMessageOrDeleteKeyMessage,
  CollectionConfig,
  DbClient,
  LoadSubsetOptions,
  SyncAppliedReceipt,
} from "@tanstack/react-db";
import type { z } from "zod";

import { formatClientError } from "@/lib/formatters";
import { forgetPowerSyncToken, getPowerSyncClient, getToAppRow } from "@/lib/powersync";
import type { TPowerSyncRow } from "@/lib/powersync";
import { loadTableSubsetFn, toSubsetRequest } from "@/lib/table-subset-fns";
import type { TSubsetRequest } from "@/lib/table-subset-fns";
import log from "@/logging/log";
import { LogMessages, LoggerLevels } from "@/logging/types";

const SYNC_TIMEOUT_MS = 10_000;
const SYNC_RETRY_MS = 100;

// A variant syncs other rows of the same table, so it is a collection of its own
function baseCollectionOptions(table: string, variant?: string) {
  return {
    id: variant === undefined ? `"${table}"` : `"${table}" ${variant}`,
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
  Omit<CollectionConfig<z.output<TSchema>, TKey, TSchema>, "id" | "sync" | "syncMode" | "utils"> & {
    schema: TSchema;
    // By default the one stream named after the table, see docker/powersync/sync-config.yaml
    streams?: ReadonlyArray<StreamSubscription>;
  };

function logSyncError(error: unknown) {
  void log(LoggerLevels.error, LogMessages.powerSyncSyncFailed, formatClientError(error));
}

type TPendingCommit = { commit: () => void; fail: (error: unknown) => void };
const pendingCommits: Array<TPendingCommit> = [];

/**
 * The client reports a checkpoint table by table, in one turn. A live query runs after every commit of a table it
 * reads, so committing them one by one joins the tables that have arrived so far and corrects the result with each
 * next one. Inside one publication the live queries run once, after the last table. withPublicationContext is internal
 * to TanStack DB and exported by its patch.
 *
 * The microtask runs before the client's waiters, so the rows are committed before a collection is marked ready and
 * before awaitSynced resolves
 */
function commitWithCheckpoint(pendingCommit: TPendingCommit) {
  pendingCommits.push(pendingCommit);
  if (pendingCommits.length > 1) return;
  queueMicrotask(() => {
    const commits = pendingCommits.splice(0);
    try {
      withPublicationContext(() => {
        for (const { commit } of commits) commit();
      });
    } catch (error) {
      // A live query failed on rows that are already committed, so it no longer matches any of these tables
      logSyncError(error);
      for (const { fail } of commits) fail(error);
    }
  });
}

/**
 * Syncs the rows of the table from PowerSync, but keeps the app's own schema, key and mutation handlers: every write
 * goes through tRPC, so the server can still reject it.
 *
 * Until PowerSync has brought the table, each query's rows come from Postgres (loadTableSubsetFn), so a first load does
 * not wait for every table it reads. PowerSync's rows replace them as they arrive, and once it has synced, the rows it
 * did not bring were deleted meanwhile
 */
export function powerSyncCollectionOptions<TSchema extends z.ZodType<object>, TKey extends string | number>({
  table,
  streams = [{ name: table }],
  ...config
}: TPowerSyncOptions<TSchema, TKey>): CollectionConfig<z.output<TSchema>, TKey, TSchema> {
  type TRow = z.output<TSchema>;
  const toAppRow = getToAppRow(table);
  return {
    ...config,
    syncMode: "on-demand",
    sync: {
      rowUpdateMode: "full",
      sync: ({ begin, write, commit, markReady, fail, truncate }) => {
        const client = getPowerSyncClient();
        const controller = new AbortController();
        // A deleted row only arrives with its PowerSync id, which is not the key of the tables keyed by other columns
        const keys = new Map<string, TKey>();
        let active = true;
        let first = true;
        let lastApplied: SyncAppliedReceipt = true;
        // Until PowerSync has brought the whole table: the rows Postgres answered, and the ones PowerSync brought, whose
        // row may be newer
        let synced = false;
        const postgresKeys = new Set<TKey>();
        const syncedKeys = new Set<TKey>();

        const cleanup = () => {
          if (!active) return;
          active = false;
          controller.abort();
          lease.release();
          unlisten();
        };

        // A row that fails to convert keeps its last synced value, instead of dropping every other row it came with
        const toKeyedRow = (id: string, row: TPowerSyncRow): TRow | undefined => {
          try {
            const value = toAppRow({ ...row, id }) as TRow;
            const key = config.getKey(value);
            keys.set(id, key);
            syncedKeys.add(key);
            return value;
          } catch (error) {
            logSyncError(error);
            return undefined;
          }
        };

        const onChanges = (changes: TableChanges) => {
          if (!active) return;
          const writes = [...changes].flatMap(([id, row]): Array<ChangeMessageOrDeleteKeyMessage<TRow, TKey>> => {
            if (row === null) {
              const key = keys.get(id);
              keys.delete(id);
              if (key !== undefined) syncedKeys.delete(key);
              return key === undefined ? [] : [{ type: "delete", key }];
            }
            const value = toKeyedRow(id, row);
            return value === undefined ? [] : [{ type: "update", value }];
          });
          if (!first && writes.length === 0) return;
          begin();
          // The first changes are every row, which replace the ones of an earlier run
          if (first) truncate({ markReady: false });
          for (const operation of writes) write(operation);
          const applied = commit(controller.signal);
          lastApplied = applied;
          first = false;
          // Not awaited: TanStack holds the receipt until a mutation handler settles, which may be waiting for these
          // rows in awaitSynced
          if (applied !== true) {
            applied.catch((error: unknown) => {
              if (!active) return;
              cleanup();
              logSyncError(error);
              fail(error);
            });
          }
        };

        const unlisten = client.listen(table, {
          onChanges: (changes) => {
            const commitChanges = () => {
              try {
                onChanges(changes);
              } catch (error) {
                // TanStack rejected the rows, so the collection no longer matches the server
                logSyncError(error);
                fail(error);
              }
            };
            // The rows the client already holds arrive while it registers the listener. Committed at once, the live
            // query that started the collection finds them in it and only loads the ones it needs
            if (first) {
              commitChanges();
              return;
            }
            commitWithCheckpoint({
              commit: commitChanges,
              fail: (error) => {
                if (active) fail(error);
              },
            });
          },
          // Connection errors, which the client retries and logs once from its status
          onError: () => undefined,
        });
        const lease = client.acquireStreams(streams, {
          // The service rejected the stream, which no retry fixes. Releasing it keeps every reconnect from failing and
          // logging it again
          onError: (error) => {
            if (!active) return;
            cleanup();
            logSyncError(error);
            fail(error);
          },
        });
        const untilSynced = lease
          .waitForSync(controller.signal)
          .then(async () => lastApplied)
          .then(
            async () => {
              synced = true;
              // A row deleted after Postgres answered never reaches this tab through PowerSync
              const deleted = [...postgresKeys].filter((key) => !syncedKeys.has(key));
              postgresKeys.clear();
              if (!active || deleted.length === 0) return;
              begin();
              for (const key of deleted) write({ type: "delete", key });
              const applied = commit(controller.signal);
              if (applied !== true) await applied;
            },
            // Stream and commit errors are handled above, and a cleanup cancels the wait
            () => undefined,
          )
          .catch(logSyncError);

        const loadFromPostgres = async (request: TSubsetRequest) => {
          const rows = await loadTableSubsetFn({ data: request }).catch((error: unknown) => {
            void log(LoggerLevels.error, LogMessages.tableSubsetLoadFailed, formatClientError(error));
            return null;
          });
          if (rows === null) return untilSynced;
          // Shared by every query that asked for the same rows, so one of them giving up still writes them
          if (!active || synced) return;
          begin();
          for (const row of rows) {
            const value = row as TRow;
            const key = config.getKey(value);
            if (syncedKeys.has(key)) continue;
            postgresKeys.add(key);
            write({ type: "update", value });
          }
          const applied = commit(controller.signal);
          if (applied !== true) await applied;
        };

        // The count and the rows of a table, and its joins, often ask for the same subset
        const loads = new Map<string, Promise<void>>();
        const loadSubset = (options: LoadSubsetOptions): true | Promise<void> => {
          if (synced) return true;
          const request = toSubsetRequest(table, options);
          const id = JSON.stringify(request);
          const load = loads.get(id) ?? loadFromPostgres(request);
          loads.set(id, load);
          return load;
        };
        void untilSynced.then(() => loads.clear());

        // Ready from the start: a query waits for its own subsets instead
        markReady();
        return { cleanup, loadSubset };
      },
    },
  };
}

// Each DbClient materializes its own Collection from the descriptor. Only the browser's does: the server renders no
// component that reads one
export function powerSyncCollection<TConfig extends CollectionConfig<any, any, any, any>>(
  table: string,
  createConfig: (baseOptions: ReturnType<typeof baseCollectionOptions>, dbClient: DbClient) => TConfig,
  variant?: string,
) {
  const baseOptions = baseCollectionOptions(table, variant);
  return collectionOptions(baseOptions.id, (dbClient) => createConfig(baseOptions, dbClient));
}

/**
 * Waits until the collections show what the server has committed so far. A mutation handler awaits it after its tRPC
 * call, so its optimistic rows are swapped for the synced ones without showing the old rows in between.
 *
 * One checkpoint covers every table, whichever ones the mutation wrote.
 */
export async function awaitSynced() {
  const client = getPowerSyncClient();
  const signal = AbortSignal.timeout(SYNC_TIMEOUT_MS);
  for (;;) {
    // No collection is syncing, so none has rows to wait for
    if (client.status.state === "idle") return;
    try {
      await client.confirmWrites({ signal });
      return;
    } catch {
      if (signal.aborted) {
        // The server already committed the mutation, so failing here would report an error for a saved change and
        // invite a retry that saves it twice. The synced rows still arrive on their own
        void log(LoggerLevels.warning, LogMessages.powerSyncSyncTimedOut);
        return;
      }
      // The token or checkpoint request failed while the service is unreachable, which the client retries and logs
      forgetPowerSyncToken();
      await new Promise((resolve) => setTimeout(resolve, SYNC_RETRY_MS));
    }
  }
}
