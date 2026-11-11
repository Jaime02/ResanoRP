# Migration log: ElectricSQL → PowerSync

Date: 2026-11-10 / 2026-11-11. Branch: `powersync`.

## 1. Why

Electric worked, but it took a growing pile of workarounds to keep it correct. Each one was a place where a bug could come back:

| Problem with Electric                                                                                                                                                                                                       | Workaround it needed                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ShapeStream.requestSnapshot` moved a running stream to the offset of every on-demand subset snapshot, so changes to rows outside that subset were skipped. Rows went back to their old values after a successful mutation. | A local patch to `@electric-sql/client` plus a 270-line guard test (`electric-snapshot-offset.test.ts`).                                                                                                                                                                                                                                                                                                   |
| A subset snapshot requested while a change was in flight never received that change (electric#4847).                                                                                                                        | A comment and a `waitForSubsetSnapshots()` helper in the tests.                                                                                                                                                                                                                                                                                                                                            |
| A response body cut off mid-read (for example by leaving the page) failed the collection for good (electric#4843).                                                                                                          | A custom `onError` that treated 2xx `FetchError`s as retryable.                                                                                                                                                                                                                                                                                                                                            |
| Electric answers 409 during normal operation (electric#3150).                                                                                                                                                               | The logging middleware ignored every 409.                                                                                                                                                                                                                                                                                                                                                                  |
| `awaitTxId` only works on a collection that the transaction actually wrote, and only once that collection has a running stream.                                                                                             | Every mutation had to list the collections it touched (`collection:` in `showToastOnTRPCMutation`, sometimes worked out from the result, such as `deletedBlueprintIds`). `AppContextProvider` kept a subscription open on **every** collection for the whole app lifetime. The submit button had to be disabled on pristine updates, because a no-op update never synced back and its txid wait timed out. |
| Shapes were proxied through the app (`/api/models/$table`).                                                                                                                                                                 | Bun's 10 s idle timeout turned 20 s long-polls into 502s, browser caching replayed stale snapshots (`no-store`), and long key lists hit 431 (`subsetMethod: "POST"`).                                                                                                                                                                                                                                      |
| The server render had to load live queries itself.                                                                                                                                                                          | `preloadLiveQueries` used a separate `DbClient` with a 5 s timeout, so it would not hang SSR or leak unsynced rows into hydration.                                                                                                                                                                                                                                                                         |

PowerSync replaces the per-collection txid with one checkpoint for the whole database. A write only has to wait for "the server has committed it and this browser has applied it", and does not need to know which tables changed.

## 2. What was chosen (and how it differs from the original brief)

The original brief (`ignore/message.txt`, `ignore/prompt.md`) asked for the **in-memory, online-only** `@powersync/tanstack-db-lite` at a pinned commit. It was **not** used:

- It is unpublished on npm and would have to be vendored. It targets an older TanStack DB API (`markError` instead of `fail`) and supports only string ids.
- The published `@tanstack/powersync-db-collection` (SQLite-backed, `@powersync/web`) works with the TanStack DB version the app already uses.

Decisions taken:

1. **SQLite collection** (`@powersync/web` 2.7.0 + `@tanstack/powersync-db-collection` 1.0.0-rc.1.4). Each browser holds a local SQLite database in OPFS (`OPFSCoopSyncVFS`, the VFS recommended for several tabs).
2. **Integer ids kept.** Numeric collection keys come from TanStack/db#2392, applied as a `bun patch` (`dist/esm` only).
3. **Writes stay in tRPC.** PowerSync's upload queue is unused (`uploadData` is a no-op). The server still validates, authorizes, writes files and can reject a mutation, exactly as before.
4. **SSR is data-only** (`defaultSsr: "data-only"`). Collections can't load on the server, because there is no browser SQLite there.
5. **Every collection is eager.** On-demand was tried first and was too slow (see §5).

## 3. What changed

### Infrastructure

- `docker/docker-compose.base.yml` and `envs/production/docker-compose.yml`: removed the `electric` service and added:
  - `powersync-init`: a one-off `psql` that runs `docker/powersync/init.sql`. It creates the `powersync_storage` database and the `powersync` publication `FOR ALL TABLES`, both idempotent. It runs on every start, so a restored dump or a recreated schema gets them back.
  - `powersync`: `journeyapps/powersync-service:1.28.1`, unified mode, with a healthcheck on `/probes/liveness`. Caddy depends on it being healthy.
- `docker/powersync/service.yaml`: Postgres replication source, Postgres storage in its **own** database (otherwise the all-tables publication would replicate PowerSync's storage back into itself), and HS256 JWT auth.
- `docker/powersync/sync-config.yaml`: one auto-subscribed stream with a `SELECT *` per table. PowerSync needs a text `id`:
  - Tables keyed by integer `id`: `SELECT *, CAST(id AS TEXT) AS id` (`*` comes first because the last column with a name wins).
  - Tables with other keys: `part_price_estimator` uses `partId`. The composite tables (`machine_production_order_queue`, `part_component`, `part_material`) build an id like `a || '-' || b`.
- `docker/Caddyfile`: `/powersync/*` is reverse-proxied to `powersync:8080` with `flush_interval -1` (sync is one long streamed response). It sits on the same origin as the app, so there is no CORS and no extra port.
- Env files: `VITE_ELECTRIC_PORT`/`ELECTRIC_URL` are replaced by `POWERSYNC_JWT_SECRET`.
- `prepare-production.ts` copies `docker/powersync/` into the production bundle. `start.cmd`'s comment now refers to PowerSync's slot and storage.
- `reset-env.ts` now runs `cleanDatabase` **before** dropping the schema. PowerSync does not notice a dropped table and would keep serving its old rows, so they are deleted first through replication. (Electric had the opposite constraint: those DELETEs crashed it.)
- `vite.config.ts`: `@powersync/web` is excluded from prebundling (prebundling breaks its worker and WASM URLs), and `worker.format: "es"`.

### Client data layer

- `src/lib/powersync.ts`:
  - The PowerSync `Schema` is **derived from the Drizzle schema**, so a new column only has to be added there. A new table also needs a query in `sync-config.yaml`.
  - `toAppRow` converts SQLite values back to app types: booleans `0/1` → `boolean`, `integer` → `number`, timestamps → `Date` (replacing the space with `T`).
  - The database is created lazily, so a server render never opens it. `connect()` runs with `checkpointMode: "requests"`, and a status listener logs each new `downloadError` once.
- `src/lib/powersync-token.ts` and `powersync-token-fns.ts`: the app server signs a 1 h HS256 JWT (`kid: resanorp`, `aud: powersync`, one shared `sub`), served through a `createServerFn`. The app has no user login, so every browser is the same PowerSync user.
- `src/collections/base.ts`:
  - `powerSyncCollection(table, …)` replaces `electricCollection`. It is still a `collectionOptions` descriptor, so each `DbClient` creates its own collection.
  - `powerSyncCollectionOptions` reuses the library's `sync`/`startSync`/`utils` but keeps the app's **own** Zod schema, `getKey` and tRPC mutation handlers. A custom `deserializationSchema` maps rows through `toAppRow` and sets `id = getKey(row)`, which makes composite and alternate keys work.
  - `onLoad` waits for `database.waitForFirstSync()`. Otherwise a new browser would show empty tables instead of a loading state.
  - `awaitSynced()` replaces `awaitTxId`:
    1. `database.requestCheckpoint()`, then `checkpoint.waitForSync()`. The server-side commit is now in local SQLite.
    2. Poll (every 20 ms) until each collection's diff-tracking table is empty. Only then have the rows reached the in-memory collections.
    3. A 10 s timeout covers both steps. On timeout it **logs a warning and resolves**: the server already committed, so throwing would report an error for a saved change and invite a duplicate resubmission.
- All 30 collection files: `electricCollectionOptions` → `powerSyncCollectionOptions`, `syncMode: "on-demand"` removed, `awaitTxId(result.txid)` → `awaitSynced()`.

### Server

- `generateTxId` and every `txid` in tRPC results are removed (27 routers). `deletedBlueprintIds` is gone from `part.delete`.
- `/api/models/$table` (the Electric proxy) and `src/lib/electric.ts` are deleted.
- The logging middleware no longer ignores 409.

### UI and contexts

- `AppContextProvider`: the "subscribe to every collection forever" effect and the `collectionsReady` wait are gone. `showToastOnTRPCMutation` calls `awaitSynced()` once, with no `collection:` argument.
- `TBaseMutationResult` no longer has `txid`. 27 form hooks and the tables stop passing collections.
- `__root.tsx` no longer has a loader. `preloadLiveQueries` and the shared `machineByIdQuery`/`partTableQueries` builders are inlined back into their hooks.
- `src/collections/index.ts` (`allCollections`) is deleted.

### Tests

- `electric-snapshot-offset.test.ts` is deleted, along with `waitForSubsetSnapshots()` and its uses in `delivery-note.test.ts`.
- `errors-log.ts`, `part.test.ts` and the test components are adjusted to the new log messages and flows.

## 4. How it works now

```
Browser                                            Server
───────                                            ──────
useLiveQuery ──► TanStack DB collection (memory)
                    ▲  diff triggers
                    │
             PowerSync SQLite (OPFS) ◄── /powersync (Caddy) ◄── powersync-service ◄── Postgres WAL
                                                                (storage: powersync_storage DB)
mutation ──► optimistic row ──► tRPC ──────────────────────────► Drizzle tx ──► Postgres
                                  │
                                  └─► awaitSynced(): checkpoint → waitForSync → tracking tables empty
                                        → optimistic row is replaced by the synced one, with no flicker
```

- **Reads**: Postgres changes → logical replication → PowerSync service → streamed to every browser → local SQLite → diff triggers → in-memory collections → live queries and joins (unchanged TanStack DB API).
- **Writes**: unchanged command protocol. The optimistic mutation goes through a tRPC procedure in a Drizzle transaction. A server rejection rolls back the optimistic state as before.
- **Confirmation**: one database-wide checkpoint per mutation, whatever tables it touched.
- **Auth**: app server → JWT → PowerSync. One shared identity; every browser syncs every row.
- **SSR**: the server renders the shell and runs `beforeLoad` (user-mode cookie). Data renders in the browser.

## 5. New issues and trade-offs

| Issue                                                                                                                                                                                                                                                        | Status                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| **No server-rendered data.** Pages render their data only after hydration, once SQLite has loaded. Before, the root loader preloaded the user-mode machine on the server.                                                                                    | Accepted (`data-only`).                                                      |
| **The whole database lives in every browser.** Every table is synced in full; on-demand loading is gone. A first visit downloads everything before `waitForFirstSync` resolves.                                                                              | Not measured against the production database size.                           |
| **On-demand was too slow.** Each `loadSubset` rebuilt the collection's diff triggers (~120–600 ms, serial, cascading through lazy joins). The part picker took ~1.4 s per filter, and `delivery-note.test.ts` "manage the delivery notes" took >180 s.       | Fixed by going eager. **The timings were not re-measured after the switch.** |
| **`awaitSynced` polls.** The library empties its tracking tables with a `DELETE` without `WHERE`, which SQLite truncates without change notifications, so there is no event to wait on. Tracking tables are persisted (in `sqlite_master`), not temp tables. | 20 ms poll, 10 s cap.                                                        |
| **Timeout means "unknown, probably fine".** If sync is down, a committed mutation resolves after 10 s with a warning, and the UI shows the optimistic row until sync catches up.                                                                             | By design: no retry, so nothing is saved twice.                              |
| **Patch on `@tanstack/powersync-db-collection`** (numeric keys, TanStack/db#2392, `dist/esm` only). A version bump silently drops it, and every integer-keyed collection then fails with `Record must have a string id field`.                               | Documented in `CLAUDE.md`. Drop it once the PR is released.                  |
| **`requestCheckpoint` is `@alpha`** in `@powersync/web`.                                                                                                                                                                                                     | Watch on upgrades.                                                           |
| **A dropped table is invisible to PowerSync.** Its rows stay until they are deleted through replication.                                                                                                                                                     | `reset-env.ts` cleans before dropping.                                       |
| **Shared credentials.** Anyone who reaches the app can get a token and sync every table. This is the same exposure as the old unauthenticated `/api/models/$table` proxy.                                                                                    | Unchanged from before.                                                       |
| **Multi-tab.** It relies on `OPFSCoopSyncVFS`.                                                                                                                                                                                                               | Not explicitly verified.                                                     |
| **Original brief not followed.** The in-memory `tanstack-db-lite` (online-only, no local DB) was not used, see §2.                                                                                                                                           | User decision.                                                               |

## 6. Verification status

- E2E suites were run on 2026-11-11 against the on-demand version, which surfaced the slowness above. The eager version has **not** had a full e2e pass recorded.
- Never explicitly verified: quoted camelCase identifiers and `CAST` in `sync-config.yaml` under all tables, `requestCheckpoint` through Caddy's `/powersync` path, reconnect after a PowerSync restart, cold start on an empty browser with a production-sized database, and multi-tab.
- When something sync-related fails, check those points first. PowerSync logs: `docker logs resanorp-test-powersync-1`.

## 7. Adding a table

1. Add it to the Drizzle schema (`src/db/schema.ts`). The column types must be ones `SQLITE_COLUMN_TYPES` supports, or `src/lib/powersync.ts` throws.
2. Add a `SELECT` to `docker/powersync/sync-config.yaml` with a text `id` (cast or composite).
3. Create the collection with `powerSyncCollection` + `powerSyncCollectionOptions`, and call `awaitSynced()` after each tRPC call in its handlers.
