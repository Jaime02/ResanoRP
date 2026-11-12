# Migration log: ElectricSQL → PowerSync (Lite)

Branch `powersync-lite`, 2026-11-10 to 2026-11-12. Describes the code as it is on this branch. §8 keeps the SQLite attempt
for history, §9 lists the review fixes of 2026-11-12.

## 1. Why

Electric worked, but every fix was a workaround that could break again:

- `ShapeStream.requestSnapshot` moved a running stream to the offset of each subset snapshot, so rows reverted after a
  successful mutation. Needed a patch to `@electric-sql/client` and a 270-line guard test.
- A subset snapshot requested during an in-flight change never received it (electric#4847), a response cut off
  mid-read failed the collection for good (electric#4843), and Electric answered 409 in normal operation (electric#3150).
- `awaitTxId` only worked on a collection the transaction wrote, with a running stream. Every mutation listed the
  collections it touched, `AppContextProvider` kept every collection subscribed, and a no-op update timed out.
- Shapes went through an app proxy (`/api/models/$table`): Bun's idle timeout, browser caching and 431s.
- SSR preloaded live queries with a separate `DbClient`.

PowerSync confirms a write with one checkpoint for the whole database: "the server committed it and this browser
applied it", whatever tables changed.

## 2. What was chosen

- **Client: `@powersync/tanstack-db-lite`** (in memory, online only), vendored at commit `6de2267` in
  `src/lib/powersync-lite/` because it is not on npm. Only `client.ts` and `subscriptions.ts`; its collection adapter
  assumes string ids and an older TanStack DB. The connection comes from `@powersync/shared-internals@1.6.0`
  (`standalone`), an internal API, so it is pinned.
- **Writes stay in tRPC.** The server validates, authorizes, writes files and can reject. PowerSync's upload queue is not
  used. After each write the client requests a checkpoint (PowerSync's "checkpoint requests" pattern), which is what
  keeps optimistic rows from flickering without the queue.
- **Integer ids kept**: the app's own adapter (`src/collections/base.ts`) keys rows with each collection's `getKey`.
- **Data-only SSR** (`defaultSsr: "data-only"` in `src/start.ts`): the server runs `beforeLoad` and renders the shell;
  every route component, root included, renders in the browser only (TanStack wraps it in `ClientOnly`).
- **Every collection is eager**, one Sync Stream per table.

## 3. How it works

```
useLiveQuery ──► TanStack DB collection (memory) ◄── Lite client (memory, one per tab)
                                                        ▲  /powersync/sync/* (Caddy, same origin)
                                                        │
                                   powersync-service ◄── Postgres WAL (role powersync_role)
                                   (storage: powersync_storage DB)

mutation ──► optimistic row ──► tRPC ──► Drizzle tx ──► Postgres
                                  └─► awaitSynced(): token → checkpoint request → wait until applied
```

- **Reads**: each collection leases the stream named after its table. The client sends one HTTP stream with the union of
  the leased streams. A collection is ready once a complete checkpoint including its stream is applied.
- **Writes**: optimistic mutation, tRPC procedure in a Drizzle transaction, a rejection rolls back as before.
- **Confirmation**: `awaitSynced()` (`base.ts`) calls `confirmWrites()`. The synced rows reach the collections before it
  resolves, so TanStack swaps optimistic for synced rows in one render. Failed token or checkpoint requests are retried
  every 100 ms up to 10 s. On timeout it logs `powerSyncSyncTimedOut` and resolves: the server already committed, and an
  error would invite a duplicate save. It returns at once when no collection is syncing (client `idle`).
- **Auth**: the app server signs a 1 h HS256 JWT (`kid: resanorp`, `aud: powersync`, one shared `sub`) through a server
  function. Every browser is the same PowerSync user and syncs every row, the same exposure as the old Electric proxy.
  The browser reuses the token until 60 s before expiry; any connection or checkpoint error discards it.
- **Errors**: the status listener in `src/lib/powersync.ts` logs a connection error once per distinct message, only if
  the client is still disconnected after 5 s (leaving a page breaks the stream off mid-read). A stream the service rejects
  (`StreamError`) or a commit TanStack rejects fails that collection, logs once and releases its stream. A row that fails
  to convert is logged and skipped, keeping its last synced value. Connection errors never fail a collection: it stays
  loading while the client retries (backoff 1 s to 30 s, 60 s idle timeout).

## 4. Files

### Infrastructure

- `docker/docker-compose.base.yml`, `envs/production/docker-compose.yml`: `electric` replaced by
  - `powersync-init`: one-off `psql` running `docker/powersync/init.sql` on every `up`. Idempotent: storage database,
    publication `powersync FOR ALL TABLES`, role `powersync_role` (`LOGIN REPLICATION BYPASSRLS`, password =
    `POSTGRES_PASSWORD`) with `SELECT` on existing tables and global default privileges for new schemas and tables, so
    `reset-env.ts` dropping and recreating `public` keeps it readable.
  - `powersync`: `journeyapps/powersync-service:1.28.1`, unified mode, liveness healthcheck. Caddy waits for it.
    Replicates as `powersync_role`; storage (its own database, or the all-tables publication would replicate it into
    itself) uses the superuser.
  - `db`: `max_slot_wal_keep_size=10GB`. A stopped PowerSync otherwise keeps WAL until the disk fills. Past the cap the
    slot is invalidated and PowerSync replicates from scratch (if that happens during the initial snapshot, drop the slot
    by hand, see the skill's `powersync-debug.md`).
- `docker/powersync/service.yaml`: Postgres source and storage, HS256 key `resanorp`, audience `powersync`. Must stay
  in step with `src/lib/powersync-token.ts`.
- `docker/powersync/sync-config.yaml`: edition 3, one stream per table named after it, no `auto_subscribe`. PowerSync
  needs a text `id`: `SELECT *, CAST(id AS TEXT) AS id` (the last column of a name wins); `part_price_estimator` uses
  `partId`, the composite tables join their keys with `-`.
- `docker/Caddyfile`: only `/powersync/sync/*` is proxied (prefix stripped, `flush_interval -1`); the rest of the
  service's API stays internal.
- Env: `VITE_ELECTRIC_PORT`/`ELECTRIC_URL` replaced by `POWERSYNC_JWT_SECRET`, a base64url string of 32 random bytes
  (`bun -e "console.log(crypto.getRandomValues(Buffer.alloc(32)).toString('base64url'))"`). It is the JWK `k`, so plain
  text or standard base64 signs tokens the service rejects. Committed in `.env.test` and `.env.development`; the
  untracked `.env.production`, `.env.prisma` and `.env.blank` need it too.
- `prepare-production.ts` copies `docker/powersync/` and dumps the import with `--no-publications --no-privileges`
  (`start.cmd` restores before `powersync-init` creates the role). `bundle-production.ts` zips the `powersync` folder.
- `start.cmd`: `down -v` drops the replication slot and storage with the volume.
- `reset-env.ts` runs `cleanDatabase` before dropping the schema: PowerSync does not notice a dropped table, so its rows
  are deleted through replication first.

### Client

- `src/lib/powersync.ts`: per-table converters derived from the Drizzle schema (boolean `0/1`, integer, numeric as
  string, timestamp to `Date`; an unsupported column type throws at module load, an invalid timestamp throws for that
  row). The shared `PowerSyncClient`, created on first use so a server render never connects. The token cache and the
  status listener (§3 Errors, §5 storage reset).
- `src/lib/powersync-token.ts` (`node:crypto`, server bundle only) and `powersync-token-fns.ts` (the server function,
  an RPC stub in the client bundle). It throws if `POWERSYNC_JWT_SECRET` is missing.
- `src/collections/base.ts`: `powerSyncCollectionOptions` (adapter modelled on Lite's `index.ts`; a `Map` from PowerSync
  id to app key resolves deletes), `powerSyncCollection` (the `collectionOptions` descriptor, ids keep Electric's quoted
  form), `awaitSynced`.
- All 30 collection files: `awaitTxId(result.txid)` → `awaitSynced()`, `syncMode: "on-demand"` removed.

### Server, UI, tests

- `txid`, `generateTxId`, `deletedBlueprintIds` and the "which rows were written" results are gone from the tRPC
  routers and `src/db/functions`. `/api/models/$table` and `src/lib/electric.ts` are deleted.
- The logging middleware still skips 409s: a conflict is a rejection the procedure already logs.
- `AppContextProvider` no longer subscribes to every collection; `showToastOnTRPCMutation` calls `awaitSynced()` with no
  `collection:` argument. The root and part loaders, `preloadLiveQueries` and `src/collections/index.ts` are deleted.
- Tests: `electric-snapshot-offset.test.ts`, `trackSubsetSnapshots` and its use in `delivery-note.test.ts` are deleted
  (they covered Electric's library). `part.test.ts` only renames its lag constant. No assertion was loosened;
  `errors-log.ts` ends unchanged from master.

## 5. Trade-offs and edge cases

| Issue                                                                                                                                                                                                                          | Status                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| No server-rendered data: pages render after hydration and sync.                                                                                                                                                                | Accepted.                                                         |
| Every page load downloads its tables in full, per tab. Each row is held about three times in memory (oplog JSON, parsed row, app row).                                                                                         | Not measured against production data.                             |
| The stream restarts whenever the leased tables change (a collection mounts, or one is collected after `gcTime`). It resumes from the buckets it holds, but a released table is downloaded again. Lite has no subscription TTL. | Watch navigation-heavy flows.                                     |
| A pending checkpoint holds **every** incoming change of the tab, not only the written rows, until the service confirms it.                                                                                                     | Inherent to checkpoints.                                          |
| After a timeout the UI shows the old rows until the synced ones arrive.                                                                                                                                                        | By design: no retry, nothing saved twice.                         |
| Storage reset while tabs are open (`start.cmd` import): a tab that saved before waits for a checkpoint the new storage never sends, and would never apply another change.                                                      | Fixed: a reconnect after an error requests a new checkpoint (§6). |
| Service unreachable on a first load: collections stay loading, the error is logged after 5 s.                                                                                                                                  | By design.                                                        |
| Vendored alpha code and an internal `shared-internals` API.                                                                                                                                                                    | Pinned. Replace the folder once Lite is published.                |
| Needs HTTPS (`crypto.randomUUID`) and a recent browser (`Map.prototype.getOrInsertComputed`, iterator helpers, `URL.parse`, `Map.groupBy`, `Promise.withResolvers`).                                                           | Add polyfills if workshop PCs run old browsers.                   |
| A dropped table is invisible to PowerSync.                                                                                                                                                                                     | `reset-env.ts` cleans first.                                      |
| Shared credentials: anyone reaching the app can sync every table.                                                                                                                                                              | Unchanged from Electric.                                          |

## 6. Verification (2026-11-12)

Checked by reading the code, the service source in the `powersync-service:1.28.1` image, and an isolated throwaway stack
(compose project `resanorp-verify`, the repo's `init.sql`, `service.yaml`, `sync-config.yaml` and `Caddyfile`, the
vendored client driven by Bun). No e2e run.

| Point                                                                                            | Verdict                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vendored files unmodified                                                                        | True: identical to upstream at `6de2267`.                                                                                                                                             |
| Replication as `powersync_role`, sync and checkpoint requests through Caddy                      | Works (stack).                                                                                                                                                                        |
| Role can read tables created after `init.sql`, and after `DROP SCHEMA public CASCADE` + recreate | Works (stack).                                                                                                                                                                        |
| Storage reset freezes a tab that saved before                                                    | Reproduced: another user's row never arrived. With the fix it arrived. The service only applies checkpoint ids that advance the stored one, per user and client (`checkpointing.ts`). |
| A rejected stream released in its `onError`                                                      | Logged once, gone from later restarts, other tables keep syncing (stack).                                                                                                             |
| `/powersync/*` outside `sync/`                                                                   | Not proxied to PowerSync (stack).                                                                                                                                                     |
| Reconnect after a PowerSync restart                                                              | Works (stack: the service was stopped and restarted).                                                                                                                                 |
| Every page load downloads its tables again; stream restarts on lease changes                     | True (code).                                                                                                                                                                          |
| `awaitSynced` returns at once when idle                                                          | True (code).                                                                                                                                                                          |
| Multi-tab                                                                                        | Correct but not shared: each tab has its own client id, connection and memory.                                                                                                        |
| `@tanstack/db` `getServerSnapshot` patch (React #423)                                            | Unreachable under data-only SSR: no live query renders during hydration (`Match.js` wraps components in `ClientOnly`). Kept until an e2e run without it passes.                       |
| Cold start with a production-sized database                                                      | Not verified.                                                                                                                                                                         |
| Existing volumes switching replication to `powersync_role` (slot created by the superuser)       | Not verified; slots have no owner, so expected to work.                                                                                                                               |

PowerSync logs: `docker logs resanorp-test-powersync-1` (or `-development-`).

## 7. Adding a table

1. Add it to `src/db/schema.ts`, with column types `FROM_POWERSYNC` in `src/lib/powersync.ts` supports.
2. Add a stream **named after the table** to `docker/powersync/sync-config.yaml`, with a text `id`. Without it the
   collection fails with `Stream "<table>" was not resolved`.
3. Create the collection with `powerSyncCollection` + `powerSyncCollectionOptions`, and call `awaitSynced()` after each
   tRPC call in its handlers.

## 8. History: the SQLite attempt

The first version (branch `powersync`) used `@powersync/web` + `@tanstack/powersync-db-collection` with SQLite in OPFS,
a patch for numeric keys (TanStack/db#2392), a per-page-load catch-up checkpoint and polling of the diff-trigger
tracking tables in `awaitSynced`. The e2e suite ran about 2.5× slower than on Electric (2314–2468 s against 1011 s);
page-load tests went from about 9 s to 27 s, the cost of opening SQLite in a worker and creating the triggers. Lite
removed all of that, along with its stalls (a row failing deserialization blocked every later confirmation; a local
SQLite write would have stalled sync).

## 9. Review fixes (2026-11-12)

- `bundle-production.ts` zips `powersync/`; without it production could not start PowerSync.
- The 5 s error grace no longer logs an error the client has recovered from (connected but still downloading, or idle).
- The browser caches the PowerSync token instead of a server call per mutation and reconnect.
- A stream the service rejects is released, so it is not logged again on every reconnect.
- A reconnect after an error requests a new checkpoint, so a storage reset cannot freeze a tab.
- Conversion errors skip only the bad row; an invalid timestamp is an error instead of an `Invalid Date`.
- Replication uses `powersync_role`, the database caps slot WAL at 10 GB, Caddy proxies only `/powersync/sync/*`.
- Comments corrected: the token lifetime limit is 24 h, not 1 h; `AppContextProvider` is not server-rendered.
