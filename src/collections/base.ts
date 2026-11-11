import { BasicIndex, collectionOptions } from "@tanstack/react-db";
import type {
  ChangeMessageOrDeleteKeyMessage,
  CollectionConfig,
  DbClient,
  SyncAppliedReceipt,
} from "@tanstack/react-db";
import type { z } from "zod";

import { formatClientError } from "@/lib/formatters";
import { getPowerSyncClient, getToAppRow } from "@/lib/powersync";
import type { TableChanges } from "@/lib/powersync-lite/client";
import log from "@/logging/log";
import { LogMessages, LoggerLevels } from "@/logging/types";

const SYNC_TIMEOUT_MS = 10_000;
const SYNC_RETRY_MS = 100;

function baseCollectionOptions(table: string) {
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
  Omit<CollectionConfig<z.output<TSchema>, TKey, TSchema>, "id" | "sync" | "syncMode" | "utils"> & {
    schema: TSchema;
  };

function logSyncError(error: unknown) {
  void log(LoggerLevels.error, LogMessages.powerSyncSyncFailed, formatClientError(error));
}

/**
 * Syncs the rows of the table from PowerSync, but keeps the app's own schema, key and mutation handlers: every write
 * goes through tRPC, so the server can still reject it
 */
export function powerSyncCollectionOptions<TSchema extends z.ZodType<object>, TKey extends string | number>({
  table,
  ...config
}: TPowerSyncOptions<TSchema, TKey>): CollectionConfig<z.output<TSchema>, TKey, TSchema> {
  type TRow = z.output<TSchema>;
  const toAppRow = getToAppRow(table);
  return {
    ...config,
    syncMode: "eager",
    sync: {
      rowUpdateMode: "full",
      sync: ({ begin, write, commit, markReady, fail, truncate }) => {
        const client = getPowerSyncClient();
        const controller = new AbortController();
        // A deleted row only arrives with its PowerSync id, which is not the key of the tables keyed by other columns
        const keys = new Map<string, TKey>();
        let first = true;
        let active = true;
        let lastApplied: SyncAppliedReceipt = true;

        const cleanup = () => {
          if (!active) return;
          active = false;
          controller.abort();
          lease.release();
          unlisten();
        };

        const onChanges = (changes: TableChanges) => {
          if (!active) return;
          const writes = [...changes].flatMap(([id, row]): Array<ChangeMessageOrDeleteKeyMessage<TRow, TKey>> => {
            if (row === null) {
              const key = keys.get(id);
              keys.delete(id);
              return key === undefined ? [] : [{ type: "delete", key }];
            }
            const value = toAppRow({ ...row, id }) as TRow;
            keys.set(id, config.getKey(value));
            return [{ type: "update", value }];
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
            try {
              onChanges(changes);
            } catch (error) {
              logSyncError(error);
            }
          },
          // Connection errors, which the client retries and logs once from its status
          onError: () => undefined,
        });
        // One stream per table, see docker/powersync/sync-config.yaml
        const lease = client.acquireStreams([{ name: table }], {
          // The service rejected the stream, which no retry fixes
          onError: (error) => {
            logSyncError(error);
            fail(error);
          },
        });
        lease
          .waitForSync(controller.signal)
          .then(async () => lastApplied)
          .then(
            () => {
              if (active) markReady();
            },
            // Stream and commit errors are handled above, and a cleanup cancels the wait
            () => undefined,
          );

        return cleanup;
      },
    },
  };
}

// Each DbClient materializes its own Collection from the descriptor. Only the browser's does: the server renders no
// component that reads one
export function powerSyncCollection<TConfig extends CollectionConfig<any, any, any, any>>(
  table: string,
  createConfig: (baseOptions: ReturnType<typeof baseCollectionOptions>, dbClient: DbClient) => TConfig,
) {
  return collectionOptions(`"${table}"`, (dbClient) => createConfig(baseCollectionOptions(table), dbClient));
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
      await new Promise((resolve) => setTimeout(resolve, SYNC_RETRY_MS));
    }
  }
}
