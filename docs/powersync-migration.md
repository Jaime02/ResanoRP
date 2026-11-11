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
- The logging middleware still skips 409s. The Electric reason (electric#3150) is gone, but a conflict is a business rejection the procedure already logs as a mutation error, and the e2e log assertions expect no extra "HTTP request failed" entry for it. An earlier version of this branch logged them, which failed 20 tests in CI.

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

## 5. The new files in depth

### `src/lib/powersync.ts`: the local database and the schema bridge

This file owns the one `PowerSyncDatabase` of the tab and translates between the Postgres/Drizzle world and SQLite.

**Schema derived from Drizzle.** PowerSync needs a client-side `Schema` that lists every synced table and column. Writing it by hand would duplicate `src/db/schema.ts` (30 tables), so the module builds it at import time:

1. `Object.values(dbSchema).filter((value) => is(value, PgTable))` collects every Drizzle table. Relations, enums and helpers are skipped.
2. For each column it reads Drizzle's `columnType` (`PgInteger`, `PgText`, …) and maps it through `SQLITE_COLUMN_TYPES` to a PowerSync column type. SQLite has only three storage types, so:

   | Drizzle       | SQLite column | Why                                                                                                                                        |
   | ------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
   | `PgBoolean`   | `integer`     | SQLite has no boolean. PowerSync sends `0`/`1`.                                                                                            |
   | `PgInteger`   | `integer`     |                                                                                                                                            |
   | `PgNumeric`   | `text`        | Kept as a string, which is what Drizzle and the Zod schemas already use for `numeric`. Converting to `real` would lose precision on money. |
   | `PgText`      | `text`        |                                                                                                                                            |
   | `PgTimestamp` | `text`        | SQLite has no date type.                                                                                                                   |

   Any other column type **throws at module load**. That is deliberate: a new `jsonb` or `date` column fails loudly on the first page load instead of syncing as garbage. It also means one unsupported column anywhere in the schema breaks every page, including tables that have nothing to do with it.

3. The `id` column is left out of the `Table`, because PowerSync always adds its own text `id`.
4. Each table gets a `toAppRow` that reverses the encoding through `FROM_SQLITE`:
   - `PgBoolean`: `value !== 0`.
   - `PgInteger`: `Number`. This is a no-op for real integer columns, but it turns the text `id` (see `CAST(id AS TEXT)` in the sync config) back into the number the app keys by.
   - `PgTimestamp`: `new Date(value.replace(" ", "T"))`. Postgres's text format separates date and time with a space, which not every JS engine parses. The columns are `timestamptz`, so the offset travels with the value and the browser does not read UTC as local time. If the service already sends ISO 8601, the `replace` is a no-op.
   - `null` passes through untouched for every type.
   - Keys are mapped from the DB column name (`name`) to the Drizzle property name (`key`). The schema uses camelCase for both, so today they are identical. The mapping keeps it correct if they ever differ.

`getPowerSyncTable(name)` returns `schema.props[name]` instead of the `Table` built above. PowerSync's `Schema` constructor stores a named copy of each table, and the collection needs that copy (it carries the view name). `TTableName` resolves to plain `string`: Drizzle's `is()` narrows to the generic `PgTable`, which loses the literal names. Table names are therefore only checked at runtime.

**Connector.**

- `fetchCredentials` builds the endpoint from `window.location.origin + "/powersync"`. This is the same origin as the app; Caddy forwards it to the service. The token comes from a server function (below). PowerSync calls it when it connects and again before the token expires.
- `uploadData` is empty. That is correct only while nothing ever writes to the local SQLite. The collections replace the library's write handlers with tRPC calls (`base.ts`), so nothing does. If someone adds a local write (for example a collection without its own `onInsert`, or a direct `database.execute`), the row lands in PowerSync's upload queue (`ps_crud`). It is never uploaded, and PowerSync does not apply downloaded checkpoints over pending local changes, so **sync would silently stall for that browser**.

**Lifecycle.** The database is a module-level singleton created on the first `getPowerSyncDatabase()` call. Nothing on the server calls it, so a server render never touches OPFS or workers.

- `OPFSCoopSyncVFS` stores the file in the Origin Private File System and is the VFS PowerSync recommends for several tabs. With the default options, desktop browsers with SharedWorker support (not Safari) also share one sync connection across tabs.
- `connect(connector, { checkpointMode: "requests" })` is fire-and-forget. It resolves even when the service is unreachable and keeps retrying in the background. `"requests"` mode is required by `requestCheckpoint()` (needs service ≥ 1.24; the stack runs 1.28.1).
- The status listener logs each **distinct** `downloadError` once through the isomorphic `log`, which ends up in the server's `errors.log`. Recovery is not logged. Every download error is logged at `error` level, including transient ones such as a reconnect after a navigation or a PowerSync restart. The e2e fixtures fail on unexpected `errors.log` entries, so a transient sync hiccup during a test shows up as a test failure.
- The database is never closed. In development, an HMR reload of this module can create a second instance next to the first.

### `src/collections/base.ts`: collections and write confirmation

**`powerSyncCollectionOptions`.** It calls the library's `powerSyncCollectionOptions` but keeps only three things from it: `sync`, `startSync` and `utils`. Everything else stays the app's own:

- **Schema and key**: the app's Zod schema and `getKey`, not the library's PowerSync-derived schema keyed by `id`.
- **Handlers**: the app's `onInsert`/`onUpdate`/`onDelete` (tRPC), not the library's SQLite transactor. This is what keeps the server authoritative.
- **Deserialization**: a hand-written Standard Schema object (`"~standard"`) replaces Zod on the read path. It does no validation, only `toAppRow` plus `id = getKey(row)`. Historical rows that would fail today's form rules still load, as they did under Electric. For composite tables, the `id` PowerSync sent (`"3-7"`) is overwritten with the app key, which happens to have the same shape. For `part_price_estimator`, it becomes the numeric `partId`.
- **`onLoad`**: `await catchUp(database)`, shared by every collection and run once per page load. It does two things:
  - `waitForFirstSync()`: without it, a brand-new browser's collections would be "ready" with zero rows, and pages would show "no results" instead of a spinner.
  - One checkpoint (`syncCheckpoint`, bounded by 10 s): the OPFS file still holds the previous page load's rows, which may be stale. Without the checkpoint, a reopened page showed them first; CI caught this with the machine form, which loaded the old name. If the service is unreachable, the page falls back to the cached rows after the timeout. Collections started later in the same page load skip the wait, because the open stream keeps SQLite current.
- **Typing**: the config is cast `as unknown as PowerSyncCollectionConfig`, because the library's types require an `id` field in the app schema. Tables keyed by other columns have none. This cast is the one place where type checking is switched off.

The library keeps one diff-trigger "tracking table" per collection instance (`__<view>_tracking_<random>`). SQLite triggers write every insert, update and delete of the synced table into it. On a throttled change notification, the collection reads it, applies the rows, and empties it with `DELETE FROM … ` (no `WHERE`). `base.ts` records each tracking table's name in the module-level `trackedTableNames` so that `awaitSynced` can watch them.

**`powerSyncCollection(table, createConfig)`.** This keeps the `collectionOptions` descriptor pattern from the Electric version: every `DbClient` creates its own collection from the descriptor. The collection id keeps Electric's quoted form (`"part"`), so ids are unchanged.

**`awaitSynced()`** is the replacement for `awaitTxId`, and it is the heart of the migration. Every mutation handler and `showToastOnTRPCMutation` call it after the tRPC call resolves:

1. **`requestCheckpoint()`** asks the service for a checkpoint covering everything committed in Postgres so far. That includes the mutation, which committed before tRPC answered. It has no abort signal and waits as long as the stream cannot connect, so it races against the 10 s `AbortSignal.timeout`.
2. **`checkpoint.waitForSync({ signal })`** resolves when the local SQLite has applied that checkpoint.

   Steps 1–2 live in `syncCheckpoint`, which **retries both every 100 ms until the deadline**. Both reject in normal conditions: `requestCheckpoint` throws "sync client is disconnected" while `connect()` is still starting after a page load, and `waitForSync` throws while the client waits to reconnect after an error. The first CI run failed because these errors went straight to the user: a save made right after a page load showed an error toast although the server had committed it.

3. **Drain poll**: SQLite now holds the new rows, but the collections only see them after their throttled flush. `hasUnappliedChanges` checks, in one read transaction, which tracked tables still exist (a collection that stopped syncing drops its table) and whether any of them has rows. It polls every 20 ms. Polling is necessary because the library's `DELETE` without `WHERE` uses SQLite's truncate optimisation, which fires no change notification to wait on.
4. When all tracking tables are empty, the in-memory collections hold the server's rows. TanStack DB can then drop the optimistic state and show the synced row in the same render, so the user sees no flicker.

What it gets right compared to Electric:

- It is **table-agnostic**. One checkpoint covers every table the mutation touched, including side effects such as blueprints deleted with a part, or stock moved by a delivery note. That is why every `collection:` argument and `deletedBlueprintIds` could be deleted.
- A **no-op update** now confirms immediately: a checkpoint is a position in the stream, not a change that has to arrive. That is why the comment on the pristine-update guard in `ButtonSubmit` could go.
- It needs **no subscription kept alive**. The checkpoint does not depend on any collection having been open before the write.

Edge cases worth knowing:

- **Every checkpoint error is retried, permanent ones included.** A permanent failure, such as a wrong JWT secret or the legacy checkpoint mode, also ends in the 10 s timeout and its warning instead of failing fast. The download error itself is still logged by the status listener. Only a failure of the drain poll's SQLite read can still make `awaitSynced` throw.
- **A failing deserialization stalls confirmation.** If `toAppRow` throws on a row (for example on an unexpected value), the library's flush catches the error and logs it only to PowerSync's own logger (the browser console, not `errors.log`). It never reaches its `DELETE`, so that tracking table never drains, and every later mutation in the tab waits the full 10 s and logs `powerSyncSyncTimedOut`. That warning is the only server-side signal.
- `trackedTableNames` only grows. That is harmless, because the existence check filters out dropped tables.
- If `requestCheckpoint` wins the race, the timeout's abort listener is never removed. It fires later and does nothing.

### `src/lib/powersync-token.ts` and `src/lib/powersync-token-fns.ts`: auth

PowerSync accepts only JWTs. The app has no user accounts (just an admin cookie for writes), so every browser gets a token for the same subject, `resanorp`.

- `createPowerSyncToken` hand-rolls an HS256 JWT with `node:crypto` (header `kid: "resanorp"`, payload `aud: "powersync"`, `sub`, `iat`, and `exp` 1 h later). No JWT library was added for ~15 lines.
- The secret is decoded as base64url, because `service.yaml` passes the same env var as the JWK's `k`, and JWK `k` is base64url by definition. A secret generated as plain text or standard base64 with `+/` would sign tokens the service rejects. The committed secrets are 43-character base64url strings (32 bytes).
- It throws if `POWERSYNC_JWT_SECRET` is missing. The throw reaches the browser as a failed `fetchCredentials`, which is logged as a sync failure.
- The two-file split matters: `powersync-token-fns.ts` holds only the `createServerFn`, which the client bundle imports as an RPC stub, while `node:crypto` stays in `powersync-token.ts`, which only the server bundle includes.
- The server function has no authorization check beyond the global CSRF middleware (same-origin only). Anyone who can open the app can sync every table. That matches the old Electric proxy, which was also open. Per-user data scoping would need real identities in `sub` and parameterized streams.

### `docker/powersync/`: the service

- **`init.sql`** runs on every `up` through the one-shot `powersync-init` container, and both statements are idempotent (`\gexec` on a guarded `SELECT`):
  - `CREATE DATABASE powersync_storage`: PowerSync's bucket storage lives on the same Postgres server, in a separate database.
  - `CREATE PUBLICATION powersync FOR ALL TABLES`: `FOR ALL TABLES` means a table created later (for example by `reset-env.ts` recreating the schema, or a new migration) is published without touching this file. Only `sync-config.yaml` has to list it.
- **`service.yaml`**: replication source = the app DB; storage = `powersync_storage`. Storage cannot live in the app DB, because the all-tables publication would replicate PowerSync's own bookkeeping back into itself. `client_auth` declares the HS256 key (`kid: resanorp`) and the `powersync` audience. Both have to stay in step with `powersync-token.ts`.
- **`sync-config.yaml`** (edition 3, Sync Streams): one stream, `tables`, with `auto_subscribe: true`, so every client receives every query without subscribing in code. Every query is an unfiltered `SELECT *`, so soft-deleted rows (`deletedAt`) sync too, which the UI already filters as it did with Electric.
  - The `id` trick: `SELECT *, CAST(id AS TEXT) AS id` relies on PowerSync letting the last column with a given name win, so the cast `id` replaces the integer one.
  - Composite keys are joined with `-`, which is unambiguous because both parts are integers.
- **Compose**: the `powersync` service has a liveness healthcheck, and Caddy waits for it. On a fresh volume, the service performs an initial snapshot of every table before it reports data. A first sync on a large database therefore takes as long as that snapshot.
- **Replication slot**: PowerSync holds a logical replication slot on the app DB. If the service stays down, Postgres keeps WAL for it indefinitely (no `max_slot_wal_keep_size` is set), so a PowerSync container stopped for days in production can fill the disk. Electric's slot had the same property. `start.cmd` drops the slot with the volume on restore.

### `docker/Caddyfile`

`handle_path /powersync/*` strips the prefix and proxies to `powersync:8080`. `flush_interval -1` disables response buffering, which the long-lived sync stream needs. Everything else falls through to the app in a separate `handle` block, so the two routes never overlap. Because the path is on the app's own origin and certificate, the browser needs no CORS setup or extra port. That replaces the Electric port (`VITE_ELECTRIC_PORT`) that was published before.

### `patches/@tanstack%2Fpowersync-db-collection@1.0.0-rc.1.4.patch`

This patch backports TanStack/db#2392 into `dist/esm` (the only build Vite uses). Upstream assumes the collection key **is** the row's string `id`:

- In `powersync.js`, initial snapshot rows are written with `getKey(value)` as their key instead of `row.id`. Without it, integer-keyed collections reject every row with `Record must have a string id field`.
- In `PowerSyncTransactor.js`, local `UPDATE`/`DELETE` statements use `String(mutation.key)` instead of `asPowerSyncRecord(original).id`. The app never runs the transactor (writes go through tRPC), so this half is inert here but kept to stay identical to the PR.

## 6. New issues and trade-offs

| Issue                                                                                                                                                                                                                                                        | Status                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| **No server-rendered data.** Pages render their data only after hydration, once SQLite has loaded. Before, the root loader preloaded the user-mode machine on the server.                                                                                    | Accepted (`data-only`).                                                      |
| **The whole database lives in every browser.** Every table is synced in full; on-demand loading is gone. A first visit downloads everything before `waitForFirstSync` resolves.                                                                              | Not measured against the production database size.                           |
| **On-demand was too slow.** Each `loadSubset` rebuilt the collection's diff triggers (~120–600 ms, serial, cascading through lazy joins). The part picker took ~1.4 s per filter, and `delivery-note.test.ts` "manage the delivery notes" took >180 s.       | Fixed by going eager. **The timings were not re-measured after the switch.** |
| **`awaitSynced` polls.** The library empties its tracking tables with a `DELETE` without `WHERE`, which SQLite truncates without change notifications, so there is no event to wait on. Tracking tables are persisted (in `sqlite_master`), not temp tables. | 20 ms poll, 10 s cap.                                                        |
| **Timeout means "unknown, probably fine".** If sync is down, a committed mutation resolves after 10 s with a warning, and the UI shows the optimistic row until sync catches up.                                                                             | By design: no retry, so nothing is saved twice.                              |
| **A sync error during confirmation reported a saved change as failed.** Right after a page load `requestCheckpoint` throws "sync client is disconnected" (§5).                                                                                               | Fixed: `syncCheckpoint` retries until the 10 s deadline.                     |
| **A row that fails deserialization stalls every later confirmation in the tab** for 10 s, and the error only reaches the browser console (§5).                                                                                                               | Open.                                                                        |
| **Every transient download error is logged as `error`**, which fails e2e tests that check `errors.log`.                                                                                                                                                      | Open. Retryable transport errors are not classified separately.              |
| **A local write to SQLite would silently stall sync** (`uploadData` is a no-op).                                                                                                                                                                             | Invariant: all writes go through tRPC.                                       |
| **Patch on `@tanstack/powersync-db-collection`** (numeric keys, TanStack/db#2392, `dist/esm` only). A version bump silently drops it, and every integer-keyed collection then fails with `Record must have a string id field`.                               | Documented in `CLAUDE.md`. Drop it once the PR is released.                  |
| **`requestCheckpoint` is `@alpha`** in `@powersync/web`.                                                                                                                                                                                                     | Watch on upgrades.                                                           |
| **A dropped table is invisible to PowerSync.** Its rows stay until they are deleted through replication.                                                                                                                                                     | `reset-env.ts` cleans before dropping.                                       |
| **Shared credentials.** Anyone who reaches the app can get a token and sync every table. This is the same exposure as the old unauthenticated `/api/models/$table` proxy.                                                                                    | Unchanged from before.                                                       |
| **Multi-tab.** It relies on `OPFSCoopSyncVFS`.                                                                                                                                                                                                               | Not explicitly verified.                                                     |
| **Original brief not followed.** The in-memory `tanstack-db-lite` (online-only, no local DB) was not used, see §2.                                                                                                                                           | User decision.                                                               |

## 7. Verification status

- E2E suites were run on 2026-11-11 against the on-demand version, which surfaced the slowness above. The eager version has **not** had a full e2e pass recorded.
- CI run 43101035903 (eager version, commit `734f0b9`): 147 passed, 28 failed. Every failure came from one of two causes, both fixed afterwards: checkpoint errors right after a page load (§5), and 409s newly logged (§3 Server). The passing tests confirm that `sync-config.yaml` (quoted camelCase, `CAST`, composite ids) and `requestCheckpoint` through Caddy work. The fix has not had a CI run yet.
- Never explicitly verified: reconnect after a PowerSync restart, cold start on an empty browser with a production-sized database, and multi-tab.
- When something sync-related fails, check those points first. PowerSync logs: `docker logs resanorp-test-powersync-1`.

## 8. Adding a table

1. Add it to the Drizzle schema (`src/db/schema.ts`). The column types must be ones `SQLITE_COLUMN_TYPES` supports, or `src/lib/powersync.ts` throws.
2. Add a `SELECT` to `docker/powersync/sync-config.yaml` with a text `id` (cast or composite).
3. Create the collection with `powerSyncCollection` + `powerSyncCollectionOptions`, and call `awaitSynced()` after each tRPC call in its handlers.
