// Shared by the query benchmarks: the app's collections, filled from a copy of the benchmark database instead of
// PowerSync. Import it before any query file, so the collections it mocks are the ones they get
import { mock } from "bun:test";
import { BasicIndex, DbClient, collectionOptions } from "@tanstack/react-db";
import type { LiveQueryOptions } from "@tanstack/react-db";
import { getTableName, is } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { PgTable } from "drizzle-orm/pg-core";
import { Pool } from "pg";

import * as dbSchema from "@/db/schema";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle({ client: pool });
export const tableRows = new Map<string, Array<object>>();
await Promise.all(
  Object.values(dbSchema)
    .filter((value) => is(value, PgTable))
    .map(async (dbTable) => {
      tableRows.set(getTableName(dbTable), await db.select().from(dbTable));
    }),
);
await pool.end();

// The same collections as the app, filled from the rows above instead of PowerSync
void mock.module("@/collections/base", () => ({
  awaitSynced: async () => undefined,
  powerSyncCollection: (table: string, createConfig: (baseOptions: object, dbClient: DbClient) => object) =>
    collectionOptions(`"${table}"`, (dbClient: DbClient) =>
      createConfig({ autoIndex: "eager", defaultIndexType: BasicIndex, id: `"${table}"`, table }, dbClient),
    ),
  powerSyncCollectionOptions: ({ table, ...config }: { table: string }) => ({
    ...config,
    sync: {
      rowUpdateMode: "full",
      sync: ({ begin, write, commit, markReady }: Record<string, (argument?: unknown) => void>) => {
        begin();
        for (const value of tableRows.get(table) ?? []) write({ type: "insert", value });
        commit();
        markReady();
      },
    },
    syncMode: "eager",
  }),
}));

const collections = await Promise.all(
  [
    "blueprint",
    "client",
    "payment-method",
    "invoice",
    "delivery-note",
    "coating",
    "delivery-note-line",
    "machine",
    "machine-production-order-queue",
    "material",
    "part",
    "part-feature",
    "part-material",
    "part-production",
    "part-reference",
    "production-order",
    "quality-check",
    "raw-material",
    "sell-order",
    "sell-order-line",
    "shape",
    "treatment-reception",
    "treatment-shipment",
  ].map(async (name) => ((await import(`@/collections/${name}`)) as { default: never }).default),
);

/** Every table is in memory before the clock starts, as when a user navigates to a page */
export async function timeQueries(queries: Array<LiveQueryOptions>) {
  const dbClient = new DbClient();
  await Promise.all(collections.map(async (collection) => dbClient.collection(collection).preload()));
  const start = performance.now();
  await Promise.all(queries.map(async (query) => dbClient.preloadLiveQuery(query)));
  const ms = performance.now() - start;
  const results = dbClient
    .dehydrate({ shouldDehydrateCollection: () => false })
    .liveQueries!.map(({ snapshot }) => snapshot!.rows.map(({ value }) => value));
  await dbClient.cleanup();
  return { ms, results };
}

export const median = (values: Array<number>) => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)];

// The table hooks only call useLiveQuery, so calling one outside React hands over the queries it would run
const reactDb = { ...(await import("@tanstack/react-db")) };
const captured: Array<LiveQueryOptions> = [];
void mock.module("@tanstack/react-db", () => ({
  ...reactDb,
  useLiveQuery: (options: LiveQueryOptions | LiveQueryOptions["query"]) => {
    captured.push(typeof options === "function" ? ({ query: options } as LiveQueryOptions) : options);
    return { data: [], isReady: false };
  },
}));

export function captureQueries(callHook: () => unknown) {
  captured.length = 0;
  callHook();
  return [...captured];
}

// The part hooks also call useMemo, to turn the rows they get into the stock ledger
const react = { ...(await import("react")) };
void mock.module("react", () => ({ ...react, default: react, useMemo: (create: () => unknown) => create() }));
