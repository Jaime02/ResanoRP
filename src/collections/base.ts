import { FetchError } from "@electric-sql/client";
import type { ShapeStreamOptions } from "@electric-sql/client";
import type { ElectricCollectionUtils } from "@tanstack/electric-db-collection";
import { BasicIndex, collectionOptions } from "@tanstack/react-db";
import type { CollectionConfig, CollectionOptions, DbClient, NonSingleResult } from "@tanstack/react-db";

import { formatClientError } from "@/lib/formatters";
import clientLog from "@/logging/clientLog";
import { LoggerLevels } from "@/logging/types";

export type TElectricCollection = CollectionOptions<any, any, any, ElectricCollectionUtils<any>> & NonSingleResult;

function baseCollectionOptions(table: string) {
  return {
    id: `"${table}"`,
    defaultIndexType: BasicIndex,
    // A DbClient creates its Collections without any hook to add indexes to them, so each query creates the ones it
    // needs when it compiles
    autoIndex: "eager" as const,
    shapeOptions: {
      url: new URL(
        `/api/models/${table}`,
        typeof window !== `undefined` ? window.location.origin : `http://localhost:5173`,
      ).toString(),
      // Electric leaves timestamptz as a string, but the schemas expect a Date. Asserted to the default Parser so the
      // row type inferred from each collection's schema is not overridden by Date
      parser: { timestamptz: (date: string) => new Date(date) } as unknown as NonNullable<ShapeStreamOptions["parser"]>,
      // An on-demand join loads its other side by key, and a long list of keys in the URL is rejected with a 431
      subsetMethod: "POST" as const,
      // Electric does not retry a response whose body breaks off while it is read, as leaving the page does to every
      // shape still loading, and the collection would fail for good
      // TODO: https://github.com/electric-sql/electric/issues/4843
      onError: (error: Error) => {
        if (error instanceof FetchError && error.status >= 200 && error.status < 300) {
          return {};
        }
        void clientLog(LoggerLevels.error, `Error syncing the ${table} collection`, formatClientError(error));
        return undefined;
      },
    },
  };
}

// Each DbClient, one per server request and one in the browser, materializes its own Collection from the descriptor
export function electricCollection<TConfig extends CollectionConfig<any, any, any, any>>(
  table: string,
  createConfig: (baseOptions: ReturnType<typeof baseCollectionOptions>, dbClient: DbClient) => TConfig,
) {
  return collectionOptions(`"${table}"`, (dbClient) => createConfig(baseCollectionOptions(table), dbClient));
}
