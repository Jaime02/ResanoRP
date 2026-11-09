import { DbClient } from "@tanstack/react-db";
import type { LiveQueryOptions } from "@tanstack/react-db";
import { createIsomorphicFn } from "@tanstack/react-start";

import { formatClientError } from "@/lib/formatters";
import log from "@/logging/log";
import { LogMessages, LoggerLevels } from "@/logging/types";

// Electric retries a shape it cannot reach forever, which would hang the whole server render
const PRELOAD_TIMEOUT_MS = 5000;

/**
 * Lets the server render the given live queries with their rows. A component only picks a result up when it builds
 * its live query exactly like the preloaded one, because both are matched by the identity of the query.
 *
 * They load in a DbClient of their own and only their results are handed to the one rendering the request: loading
 * them there would sync their source collections, and every other query rendered over those collections would then
 * show rows the browser does not have yet when it hydrates.
 */
export const preloadLiveQueries = createIsomorphicFn().server(
  async (dbClient: DbClient, queries: Array<LiveQueryOptions>) => {
    const loadingDbClient = new DbClient();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.all(queries.map(async (query) => loadingDbClient.preloadLiveQuery(query))),
        new Promise((_, reject) => {
          timeout = setTimeout(() => {
            reject(new Error(`The live queries took longer than ${PRELOAD_TIMEOUT_MS}ms to load`));
          }, PRELOAD_TIMEOUT_MS);
        }),
      ]);
      dbClient.hydrate(loadingDbClient.dehydrate({ shouldDehydrateCollection: () => false }));
    } catch (error) {
      // The page still renders, and the browser loads the queries itself
      await log(LoggerLevels.error, LogMessages.liveQueriesPreloadFailed, {
        error: formatClientError(error),
      });
    } finally {
      clearTimeout(timeout);
      await loadingDbClient.cleanup();
    }
  },
);
