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

- **Client: `@powersync/standalone-client@0.1.1`** (in memory, online only), pinned. It was vendored from
  `@powersync/tanstack-db-lite` at commit `6de2267` until 2026-11-15 (benchmark run 27 showed no difference). Only its
  connection client is used: `src/collections/base.ts` has its own collection adapter for string ids and this TanStack
  DB. It depends on `@powersync/shared-internals@1.6.0` (`standalone`), an internal API.
- **Writes stay in tRPC.** The server validates, authorizes, writes files and can reject. PowerSync's upload queue is not
  used. After each write the client requests a checkpoint (PowerSync's "checkpoint requests" pattern), which is what
  keeps optimistic rows from flickering without the queue.
- **Integer ids kept**: the app's own adapter (`src/collections/base.ts`) keys rows with each collection's `getKey`.
- **Full SSR since 2026-11-27** (data-only SSR until then): the server renders every route. A route with a loader that
  preloads its live queries (only the parts list) arrives with its rows, loaded from Postgres. See §13.
- **Collections are on-demand** since 2026-11-27 (eager until then), one Sync Stream per table: until PowerSync has
  brought a table, each query's rows come from Postgres. See §13.

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
  function. Every browser is the same PowerSync user and syncs every row, the same exposure as the old Electric proxy,
  but for `audit_log`: its stream only returns rows to a token with `role: admin`, which an admin session gets, and
  only of the months (`month`, yyyyMM) the subscription asks for, as the table only grows. The Backoffice subscribes to
  the months of its date filter (`getAuditLogRange`), each set of months a collection of its own.
  The browser reuses the token until 60 s before expiry; any connection or checkpoint error discards it, and so do the
  admin login and logout, so the next sync request (a stream acquired or released) carries the new session.
- **Errors**: the status listener in `src/lib/powersync.ts` logs a connection error once per distinct message, only if
  the client is still disconnected after 5 s (leaving a page breaks the stream off mid-read). A stream the service rejects
  (`StreamError`) or a commit TanStack rejects fails that collection, logs once and releases its stream. A row that fails
  to convert is logged and skipped, keeping its last synced value. Connection errors never fail a collection: it stays
  loading while the client retries (backoff 1 s to 30 s, 60 s idle timeout).

## 4. Files

### Infrastructure

- `docker/docker-compose.base.yml`, `envs/production/docker-compose.yml`: `electric` replaced by
  - `db` healthcheck: runs `docker/powersync/init.sql` once per container (marker `/tmp/powersync-init`) before it
    reports healthy, so no separate one-off service. Idempotent: storage database,
    publication `powersync FOR ALL TABLES`, role `powersync_role` (`LOGIN REPLICATION BYPASSRLS`, password =
    `POSTGRES_PASSWORD`) with `SELECT` on existing tables and global default privileges for new schemas and tables, so
    `reset-env.ts` dropping and recreating `public` keeps it readable.
  - `powersync`: `journeyapps/powersync-service:1.28.1`, unified mode, liveness healthcheck. Caddy waits for it.
    Replicates as `powersync_role`; storage (its own database, or the all-tables publication would replicate it into
    itself) uses the superuser.
  - `powersync-compact`: the same image running `compact` every 10 minutes. The service never compacts on its own: every
    change keeps the operations it replaced, and a page load downloads all of them. Measured 2026-11-13: the test store
    held 63,308 operations for 184 rows (218 after compacting, 10 s); see §10 for the legacy data.
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
  (the `db` healthcheck creates them before `start.cmd` restores; default privileges grant the restored tables). `bundle-production.ts` zips the `powersync` folder.
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
  id to app key resolves deletes; the tables of a checkpoint commit inside one TanStack DB publication, §11),
  `powerSyncCollection` (the `collectionOptions` descriptor, ids keep Electric's quoted form), `awaitSynced`.
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
| Only the parts list is server-rendered with its rows (§13). Every other page is rendered by the server without data and shows it after hydration.                                                                              | Accepted.                                                         |
| Every page load downloads its tables in full, per tab. Each row is held about three times in memory (oplog JSON, parsed row, app row).                                                                                         | Not measured against production data.                             |
| The stream restarts whenever the leased tables change (a collection mounts, or one is collected after `gcTime`). It resumes from the buckets it holds, but a released table is downloaded again. Lite has no subscription TTL. | Watch navigation-heavy flows.                                     |
| A pending checkpoint holds **every** incoming change of the tab, not only the written rows, until the service confirms it.                                                                                                     | Inherent to checkpoints.                                          |
| After a timeout the UI shows the old rows until the synced ones arrive.                                                                                                                                                        | By design: no retry, nothing saved twice.                         |
| Storage reset while tabs are open (`start.cmd` import): a tab that saved before waits for a checkpoint the new storage never sends, and would never apply another change.                                                      | Fixed: a reconnect after an error requests a new checkpoint (§6). |
| Service unreachable on a first load: collections stay loading, the error is logged after 5 s.                                                                                                                                  | By design.                                                        |
| Alpha client (0.1.x) on an internal `shared-internals` API.                                                                                                                                                                    | Pinned.                                                           |
| Needs HTTPS (`crypto.randomUUID`) and a recent browser (`Map.prototype.getOrInsertComputed`, iterator helpers, `URL.parse`, `Map.groupBy`, `Promise.withResolvers`).                                                           | Add polyfills if workshop PCs run old browsers.                   |
| A dropped table is invisible to PowerSync.                                                                                                                                                                                     | `reset-env.ts` cleans first.                                      |
| Shared credentials: anyone reaching the app can sync every table.                                                                                                                                                              | Unchanged from Electric.                                          |

## 6. Verification (2026-11-12)

Checked by reading the code, the service source in the `powersync-service:1.28.1` image, and an isolated throwaway stack
(compose project `resanorp-verify`, the repo's `init.sql`, `service.yaml`, `sync-config.yaml` and `Caddyfile`, the
vendored client driven by Bun). No e2e run.

| Point                                                                                            | Verdict                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Replication as `powersync_role`, sync and checkpoint requests through Caddy                      | Works (stack).                                                                                                                                                                        |
| Role can read tables created after `init.sql`, and after `DROP SCHEMA public CASCADE` + recreate | Works (stack).                                                                                                                                                                        |
| Storage reset freezes a tab that saved before                                                    | Reproduced: another user's row never arrived. With the fix it arrived. The service only applies checkpoint ids that advance the stored one, per user and client (`checkpointing.ts`). |
| A rejected stream released in its `onError`                                                      | Logged once, gone from later restarts, other tables keep syncing (stack).                                                                                                             |
| `/powersync/*` outside `sync/`                                                                   | Not proxied to PowerSync (stack).                                                                                                                                                     |
| Reconnect after a PowerSync restart                                                              | Works (stack: the service was stopped and restarted).                                                                                                                                 |
| Every page load downloads its tables again; stream restarts on lease changes                     | True (code).                                                                                                                                                                          |
| `awaitSynced` returns at once when idle                                                          | True (code).                                                                                                                                                                          |
| Multi-tab                                                                                        | Correct but not shared: each tab has its own client id, connection and memory.                                                                                                        |
| `@tanstack/db` `getServerSnapshot` patch (React #423)                                            | Needed again: the app uses full SSR since 2026-11-27 (§13), the case it was written for.                                                                                              |
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

## 10. Benchmark (2026-11-13)

`benchmark/benchmark-load.ts` (how to rerun in `benchmark/README.md`) drives the UI as Administrador and times each page until its
tables show data that stays unchanged for 1.5 s, timed from the start of the navigation, so a server-rendered table
counts from its first frame.

Method: production images (`--target production`) of master `0af2f4d` (Electric), powersync `13bbdff` (SQLite) and
powersync-lite `a11c0f5`, side by side on one machine. Each stack ran in its own compose project with its own
`VITE_ENV_NAME`. Volumes and networks are named after it, so two stacks sharing one corrupt each other's database. Each
held a restore of the same `pg_dump` of the prisma database (101,239 rows); both PowerSync stores were freshly
snapshotted, one operation per row. The targets took turns load by load in a rotating order. Each cell is the median of
5 loads, and every target showed the same row counts on every page.

Seconds until data (master / powersync / lite). `cold`: new browser profile. `warm`: reload in the same profile.
`navigation`: through the router, from the row above, in a session that starts at the home page.

| Page                 | cold               | warm               | navigation         |
| -------------------- | ------------------ | ------------------ | ------------------ |
| sell orders          | 1.03 / 17.1 / 1.75 | 1.04 / 3.42 / 1.74 | 1.67 / 22.9 / 2.38 |
| delivery notes       | 0.70 / 16.9 / 2.28 | 0.76 / 3.91 / 2.34 | 1.10 / 1.42 / 1.91 |
| parts                | 0.44 / 17.3 / 2.56 | 0.36 / 4.91 / 2.64 | 0.83 / 0.96 / 0.77 |
| production orders    | 2.76 / 18.0 / 2.54 | 3.17 / 4.47 / 2.62 | 4.51 / 2.42 / 2.30 |
| invoicing            | 0.59 / 16.7 / 2.28 | 0.63 / 3.85 / 2.29 | 0.53 / 0.52 / 0.50 |
| treatment            | 1.67 / 18.7 / 2.10 | 1.80 / 5.61 / 2.12 | 1.83 / 0.48 / 0.55 |
| create delivery note | 0.74 / 17.1 / 2.51 | 0.75 / 4.32 / 2.47 | 0.35 / 0.27 / 0.25 |
| sell order           | 0.45 / 16.9 / 1.60 | 0.50 / 3.44 / 1.58 | 0.30 / 0.18 / 0.16 |
| delivery note        | 0.39 / 16.5 / 2.08 | 0.50 / 3.35 / 2.12 | 0.14 / 0.07 / 0.08 |
| part                 | 0.56 / 20.6 / 3.75 | 0.50 / 2.22 / 3.63 | 0.15 / 0.06 / 0.07 |
| whole session        |                    |                    | 11.4 / 29.3 / 9.0  |

- **Page loads**: master is fastest. It server-renders the data and loads only the rows each query needs (`on-demand`).
  Lite downloads every table a page reads, in full (2.3–4.9 MB compressed, 7–19 tables; every page reads
  `sell_order` and `sell_order_line`), and keeps nothing between loads. The SQLite branch spends ~17 s filling SQLite on
  a first load.
- **In-app navigation**: Lite is fastest overall, because the tables earlier pages synced stay in memory.
- **Production orders**: slow on every branch. With all its data in memory, Lite still spends ~1.3 s of CPU in
  `useQueryProductionOrderTable` (TanStack DB joins); master sends 10–15 MB for it.
- **Memory**: the page heap is 85–161 MB on Lite against 13–82 MB on master (main thread only, so the SQLite branch's
  worker is not counted).
- **Not covered**: localhost has no bandwidth limit, which understates Lite's bytes; no CPU throttling, though the
  workshop PCs are slower; Administrador pages only. Load from other programs changed absolute times by up to ~40%
  between runs, so only compare targets measured in the same run.

Rerun after the sell order line status fix (below) and the TanStack DB rc.1.5 update, both committed on every branch
(master `d8e3060`, powersync `83b60e4`, powersync-lite `4e55aab`; `benchmark/results/6-branches-after-fixes.txt`):
same row counts on every page and the same bytes as the first run. The machine was less loaded, so navigation got
faster on every branch; the ratios held. Whole session 7.8 / 21.5 / 6.2 s (Lite 0.80 of master, 0.79 before). Cold
loads: master 0.39–2.90 s, Lite 1.90–2.89 s, powersync 15.0–18.4 s. Lite's sell order page went from 1.60 to 1.92 s
cold against master's 0.45 to 0.56 s: its first request now also carries the production order tables, so the lines show
later but already final.

Compaction, on Lite (same machine, separate run): five rounds of updating every `sell_order_line` and
`delivery_note_line` row and restoring it left 595,859 operations for the same 101,239 rows. The sell order pages then
took 8.1–8.8 s and sent 14–16 MB. After `compact` (86 s; 7.6 s on a store already compacted) they took the same time
as a freshly snapshotted store in an interleaved control, within 6%. `VACUUM FULL` of the storage tables changed
nothing.

Rejected: syncing every stream from the moment the router is created, which saves a restart for each table a later
component reads. First loads got slower (sell order 1.6 → 2.9 s, sell orders 1.7 → 2.8 s); only navigation got faster.

Second sync request on the sell order page (measured 2026-11-13 on the prisma stack, a dev build, with
`benchmark/tools/sync-requests.ts`): the form's query needs 8 tables, so the first request asks for those. The
line rows only render once that request's checkpoint is processed, and each row then mounts the status cell and the
production order button, both running `useQueryProductionOrderStatusesBySellOrderLineIds` (`production_order`,
`part_production`, `machine`, `treatment_shipment`, `treatment_reception`), and the price picker (`part_price`).
Collections only sync once a live query subscribes, so these leases restart the stream with 14 streams.

| ms (sell order 13439) | event                                                                  |
| --------------------- | ---------------------------------------------------------------------- |
| 811                   | request 1 starts: 8 streams                                            |
| 1467                  | request 1 checkpoint: 44,991 operations, exactly the rows of the 8     |
| 1976                  | request 2 starts, in the React commit that renders the rows            |
| 2132                  | request 2 checkpoint: 10,791 operations, exactly the rows of the new 6 |
| 2204                  | line statuses and production order buttons correct                     |

- The restart downloads nothing twice: request 1 was idle, and request 2 resumes its buckets.
- Requesting the 6 tables in the first request saves no time: their ~150 ms download only moves before the rows show.
  Only a lower priority for them in the same request, so they download while the browser processes the first 8, could
  save up to that. The 0.2–0.5 s estimated before this measurement was wrong.
- Until request 2 landed (0.2 s with one line, 0.5 s with 10), a line that has a production order showed "Pendiente"
  and the "create production order" button: the query returned no production orders and the cells did not check that
  it was ready. They now render nothing until it is (`isReady`), and the pending lines' copy button stays disabled.
  Still needed after the change below: navigating in-app from the sell orders list syncs the production orders after
  the lines, and without the check showed the wrong button for 325 ms.
- The query ran twice per line, so the work after request 2 grew with the lines (72 ms for 1, 194 ms for 10). It now runs
  once in `TableSellOrderLine` for every line. The table mounts before its rows, so 5 of the 6 tables join the first
  request (13 streams, 51,723 operations) and only `part_price` restarts it. Lines now show with their final statuses
  and buttons: 250 ms earlier with 10 lines, and the wrong button no longer shows; the rows themselves show ~100 ms
  later, since the first request is bigger.

## 11. Faster page loads: what was tried (2026-11-13)

Measured on the benchmark stacks of §10 (production builds, 101,239 rows). Where a load of the sell orders page goes,
in ms from the start of the navigation: document at 15–35, scripts downloaded at ~100, scripts evaluated and the first
stream leased at ~230, token server function 5–8 ms, sync request from ~240 to ~1040, data shown at ~1700.

- **Compression: nothing to do.** The service compresses the stream itself, by the request's `Accept-Encoding`: the 7
  tables of the sell orders page are 16.3 MB plain, 2.1 MB with gzip and 2.0 MB with zstd (what Chrome asks for). Caddy
  needs no `encode`.
- **The download is limited by the service's CPU**, not by the network or the browser: while it streams, its Node
  process sits at 110–130% CPU and Postgres at 18%. It sends about 60,000 operations per second, and the 7 tables take
  the same 730–870 ms with zstd, gzip or no compression.
- **Leasing a page's streams when the router is created: rejected.** The sync request started at the same time
  (219–284 ms either way). That time is the browser evaluating the scripts; the components mount right after.
- **Early sync request: tried and removed.** An inline script in the document replayed the page's last first sync
  request (kept in `localStorage`) with a token the server rendered into it, so the service worked while the scripts
  loaded, and the client's first request took that response.
  - The request started at 18–31 ms instead of 195–265 and ended 100–250 ms sooner. On one stack, replay on against off
    (median of 5 reloads, `tools/requests.ts`): 8–11% sooner on four pages.
  - Full benchmark (`results/7-early-sync.txt` and `8-early-sync-stacks-swapped.txt`): the same build was ~8% slower on
    the second stack, so the run was repeated with the builds swapped and each cell averaged. Reloads (`warm`) got 3.2%
    faster overall (0.7–7.2% per page); first loads (+1.6%) and navigation (+0.7%) stayed within the noise.
  - Removed: it did nothing on a first visit, and its ~110 lines depended on the client's request format. It had to
    rewrite the client id of the client's later requests, since the service confirms writes per client id.
- **Where the CPU goes** (CPU profile of an unminified build, ms per load):

  | Page              | PowerSync client parsing | Live query graphs | Rest of the TanStack commit | Row conversion | React |
  | ----------------- | ------------------------ | ----------------- | --------------------------- | -------------- | ----- |
  | sell orders       | 282                      | 426               | 142                         | ~60            | 135   |
  | parts             | 636                      | 250               | 167                         | 77             | 144   |
  | production orders | 322                      | 1122              | 136                         | ~60            | 189   |
  | part              | 590                      | 117               | 190                         | 94             | 177   |
  - Row conversion (`getToAppRow`) is 2–3% of a load, a third to half of it parsing timestamps. A loop instead of
    `Object.fromEntries` was no faster in a microbenchmark and a generated function 13% faster, so 0.4% of a load. Not
    worth changing.
  - The parsing is the standalone client and `@powersync/shared-internals`. It runs while the service is still sending,
    so most of it costs no time.
  - The live query graphs are the largest cost, and they run once per table a checkpoint brings: each run joins the
    tables that have arrived so far, and the next one corrects it.

- **One graph run per checkpoint: implemented.** `commitWithCheckpoint` in `src/collections/base.ts` queues the
  tables' commits of a checkpoint and runs them inside one `withPublicationContext` (`@tanstack/db`'s `scheduler.js`,
  internal, exported by the `@tanstack/db` patch). A table's first changes, the rows the client already holds, still
  commit at once. Measured switched on and off in one unminified build (median of 9 reloads): production orders 1941
  against 2541 ms (24% sooner), parts 2376 against 2470, sell orders 1713 against 1731, create delivery note 2363
  against 2319. Dropping the patch needs upstream to offer a way to commit several collections together.

## 12. Benchmark history and final comparison (2026-11-13 to 2026-11-15)

Raw outputs in `benchmark/results/` (`benchmark/README.md` has the rerun steps). Same method as §10:
production builds, one `pg_dump` (101,239 rows), targets interleaved, medians of 5, same row counts on every target.
"10 pages" is the sum of the page medians. Compare targets only within one file: machine load moved absolute times by
up to 40% between runs.

| Runs   | What                                                                                       | Result                                                                                    |
| ------ | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| 1, 6   | master, powersync (SQLite), lite; 6 is after the line status fix and rc.1.5                | cold 10 pages 9.8 / 168.7 / 24.3 s; session 7.8 / 21.5 / 6.2 s (run 6)                    |
| 2-5    | compaction on lite (§10)                                                                   | 8.1-8.8 s uncompacted, 2.3-2.7 s compacted = fresh                                        |
| 7, 8   | early sync request, builds swapped (§11)                                                   | reloads 3.2% sooner, first loads and navigation within noise; removed                     |
| 9-12   | one graph run per checkpoint (§11)                                                         | production orders 2.64 → 2.06 s cold (11, 12), other pages -10% to +8%; kept              |
| 13, 14 | progressive collections PoC                                                                | cold detail pages 0.27-0.37 s; production orders +27%, treatment +22% vs lite; not merged |
| 15-22  | query fixes (`docs/query-performance.md`); 15 compares 27 query variants, all counts equal | see below                                                                                 |
| 23, 24 | PoC rebased on the query fixes (busy machine: master's times 30% higher)                   | cold 10 pages 11.6 s (master 10.4, lite 23.7); session 3.6 s (master 7.8, lite 5.2)       |
| 25, 26 | branch `progressive-collections`, the PoC rewritten on the query fixes                     | cold 10 pages 11.2 s (master 8.0, lite 19.0); session 2.9 s (master 6.1, lite 4.2)        |
| 27     | vendored client against `@powersync/standalone-client`                                     | no difference                                                                             |
| 29, 30 | `progressive-collections` with and without full SSR of the parts list, then swapped (§13)  | parts list cold 556 → 255 ms; part page, which has no loader, 305 → 333 ms                |

PowerSync with SQLite was left out of the runs after 6: ~17 s on every first load while it fills SQLite.

### Final: master (Electric) against the latest Lite

Runs 21 and 22 (builds swapped between the stacks, averaged), both with the query fixes: `master2` against `lite2`.
Milliseconds until the tables show data.

| Page                   | cold master | cold Lite  | warm master | warm Lite  | navigation master | navigation Lite |
| ---------------------- | ----------- | ---------- | ----------- | ---------- | ----------------- | --------------- |
| sell orders            | 667         | 1270       | 671         | 1205       | 504               | 1136            |
| delivery notes         | 619         | 1868       | 623         | 1943       | 493               | 988             |
| parts                  | 285         | 2158       | 269         | 2170       | 401               | 374             |
| production orders      | 2442        | 1598       | 2608        | 1581       | 2145              | 487             |
| invoicing              | 514         | 1842       | 471         | 1852       | 277               | 253             |
| treatment              | 1360        | 1611       | 1462        | 1594       | 868               | 243             |
| create delivery note   | 645         | 2100       | 650         | 2036       | 181               | 105             |
| sell order             | 427         | 1407       | 373         | 1376       | 223               | 72              |
| delivery note          | 325         | 1670       | 270         | 1618       | 73                | 34              |
| part                   | 333         | 1987       | 274         | 1928       | 81                | 33              |
| **10 pages / session** | **7.6 s**   | **17.5 s** | **7.7 s**   | **17.3 s** | **5.25 s**        | **3.73 s**      |

- **First and repeated loads**: Lite is 2.3x slower than master in total. It is faster only on production orders
  (1.6 against 2.4 s) and close on treatment. The cause is the one in §10: Lite downloads every table a page reads, in
  full, while master loads only the rows each query needs.
- **In-app navigation**: Lite is 29% faster than master (3.73 against 5.25 s). It wins on 7 of 10 pages; master is
  ahead only on sell orders and delivery notes. The query fixes took Lite's session from 4.40 to 3.73 s.
- **Memory**: the page heap is 75-146 MB on Lite against 15-82 MB on master.
- **Closing the cold-load gap**: only the progressive collections PoC did (§11, `docs/query-performance.md` §7), at the
  cost of the production orders and treatment regressions and 2-4 MB more sent per load. It is merged since
  2026-11-27 (§13).

## 13. Rows from Postgres first, and server rendering (2026-11-27)

### Rows from Postgres until PowerSync has the table

Collections run in TanStack DB's on-demand mode (`src/collections/base.ts`). Each query asks its collection for the
subset of rows it reads (`loadSubset`). Until PowerSync has brought the table, the subset comes from Postgres: the server
function `loadTableSubsetFn` (`src/lib/table-subset-fns.ts`) compiles the query's filter, order and limit to SQL
(`loadTableSubset`, `src/db/functions/table-subset.ts`). PowerSync's first changes then replace those rows with the whole
table, and from then on every subset is answered from memory.

- Once the table has synced, a row Postgres answered that PowerSync did not bring was deleted meanwhile, and is removed.
  PowerSync's first checkpoint can be older than the Postgres read (replication lags, e.g. right after the test reset
  reseeds the database), so the removal first waits for `confirmWrites`: a checkpoint requested after those reads.
  Without it a row vanished and came back 1-2 s later, and a form showing it reset under the user's typing.

- `loadTableSubset` answers `null` for a filter Postgres would not keep exactly the same rows for (numerics, text order,
  functions it does not translate, `in` with more than `MAX_LOOKUP_KEYS` keys) or for more than `MAX_SUBSET_ROWS` rows.
  The query then waits for PowerSync. An extra row is as wrong as a missing one, since a `not` turns one into the other.
- **Access rules.** The server function is reachable by any browser, so it keeps back what the sync config does:
  `audit_log` returns no rows to a request without an admin session, and `printer` only returns
  `PUBLIC_PRINTER_COLUMNS` (`src/db/schema.ts`, shared with the printer router). A filter or sort can only read those
  columns, since one on the password would tell its value by the rows it keeps. A new rule in
  `docker/powersync/sync-config.yaml` needs the same rule in `table-subset.ts`.
- **Tests:** `src/tests/e2e/table-subset-db.test.ts` checks every translated filter against TanStack DB's own evaluation
  of it, the filters that must wait for PowerSync, limits with their ties, and both access rules. The mock data has a
  sell order line described by hand (id 11) for the text filters.

### Server rendering

The rules for pages and loaders are in `docs/ssr.md`.

`defaultSsr` is no longer set in `src/start.ts`, so the server renders every route. A route renders its rows on the
server only if its loader preloads its live queries with `preloadLiveQueries` (`src/lib/preload-live-queries.ts`):
they load in a `DbClient` of their own, and only their results are handed to the one rendering the request, so no other
query shows rows the browser does not have yet when it hydrates. A preload that fails or takes over 5 s is logged
(`liveQueriesPreloadFailed`), and the page renders without the rows.

- On the server a collection never creates the PowerSync client, which needs `window`: it is ready at once and answers
  every subset from Postgres. A subset Postgres cannot answer exactly fails the preload instead of rendering wrong rows.
- Only the parts list has such a loader (`src/routes/part/index.tsx`). It shares `partTableQueries`
  (`src/queries/part.ts`) with `useQueryPartTable`, because a component only picks a preloaded result up when it builds
  the same query.
- A page without a loader is rendered by the server with its loading states, which costs 30–50 ms over data-only SSR
  (below). Giving such a page `ssr: "data-only"` would avoid that. The Backoffice has it, as its audit log note reads
  the clock, which differs between the server and the browser.

### Measured

Benchmark runs 29 and 30 (`benchmark/results/`), the parts list and the part page only. Production builds of
`progressive-collections` without and with the server rendering, on the benchmark data. The two builds took turns load by
load, then their images were swapped between the stacks; each cell is the average of the two runs' medians of 5 loads.
Milliseconds until the tables show data. The dump lacked 5 tables and a column of the schema, which each stack got from
`drizzle-kit export` first (see the traps of `benchmark/README.md`).

| Page, mode                    | Postgres first | + server rendering |
| ----------------------------- | -------------- | ------------------ |
| parts list, cold              | 556            | 255                |
| parts list, warm              | 560            | 210                |
| parts list, in-app navigation | 450            | 430                |
| part page, cold               | 305            | 333                |
| part page, warm               | 253            | 304                |
| part page, in-app navigation  | 71             | 69                 |

- The parts list hydrates later (about 420 against 220 ms) and sends about 185 KB more, but shows its rows 300 ms
  sooner. Postgres first already took it from about 2.2 s (rows from PowerSync only) to 0.55 s.
- The part page, which has no loader, is 30–50 ms slower with the server rendering on both stacks.

### Not verified

- The full e2e suite on this change ran in CI only, where it found the failures fixed in `96d4c43` and `f4bfbe0`.
- The production orders (+27%) and treatment (+22%) cold-load regressions of the PoC (§12, runs 13, 25–26) are not
  fixed.
- Pages other than the parts list and the part page were not measured with the server rendering, and no CPU or network
  throttling was used.
