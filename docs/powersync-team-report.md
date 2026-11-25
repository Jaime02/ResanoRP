# Self-hosted PowerSync + standalone client + TanStack DB: what we did, what we'd like to improve

## App

- An internal ERP for a small manufacturing workshop: sell orders, delivery notes, production orders, parts, invoices. A few users on a LAN, desktop browsers.
- Postgres with about 30 tables and about 100k rows (sell order lines, delivery note lines and production orders are the big ones). Ids are integers; three link tables have composite keys.
- Moved from ElectricSQL to PowerSync in Nov 2026.

## Setup

- **Service**: `journeyapps/powersync-service:1.28.1`, self-hosted, unified mode, Postgres source and Postgres storage (a separate database on the same server). Replicates as a dedicated `REPLICATION` role, publication `FOR ALL TABLES`, `max_slot_wal_keep_size=10GB`.
- **Sync config**: edition 3, **one stream per table, no `auto_subscribe`**: `SELECT *, CAST(id AS TEXT) AS id FROM <table>` (4 tables build their text id from other columns). One table leaves out a column. Only `audit_log` has parameters: the months it subscribes to, and `auth.parameter('role') = 'admin'`.
- **Auth**: no user login. The app server signs one HS256 JWT (1 h) with a shared `sub`, so every browser is the same PowerSync user and syncs every row, except `audit_log`, which only an admin session's token (`role: admin`) gets.
- **Client**: `@powersync/standalone-client@0.1.1` (in memory, online only, one client per tab), with our own TanStack DB collection adapter (`@tanstack/db` 1.0.0-rc.1.5) for integer keys. A collection leases its table's stream while a live query uses it, so the client opens one HTTP stream with the union of the leased streams and restarts it when that set changes.
- **Writes**: not through the upload queue. Optimistic mutation → tRPC → Drizzle transaction → Postgres, then a **checkpoint request** and a wait until it is applied, so TanStack replaces optimistic rows with synced ones in one render.
- **Compaction**: a sidecar runs `compact` every 10 minutes, because the service never compacts on its own.
- We tried `@powersync/web` + `@tanstack/powersync-db-collection` (SQLite in OPFS) first. Every first load took ~17 s while it filled SQLite, and the e2e suite ran 2.5× slower. Standalone removed that.

## What the queries do

- All reads are TanStack DB live queries over full tables in memory: joins across 3 to 8 tables, `groupBy` aggregates (quantity produced, pending lines per order, machines per production order), filters, sorting and pagination.
- A page reads 7 to 19 tables. Every page reads `sell_order` and `sell_order_line`.
- The heaviest page is production orders: about 2,800 orders joined to sell order lines, sell orders, parts, part production, treatment shipments/receptions and machines, of which about 50 are shown. We now filter candidates before the joins (CPU 920 → 330 ms).

## Measurements (production builds, 101,239 rows, localhost)

The numbers come from our benchmark: [`benchmark/`](https://github.com/Jaime02/ResanoRP/tree/master/benchmark). A Playwright script drives the UI and times each page until its data stops changing. Each branch runs as a production build on its own stack, with the same database restored on every stack. The targets take turns load by load, the builds are swapped between the stacks, and every target must show the same row counts. Raw outputs are in `benchmark/results/`, and `benchmark/tools/` has the probes we used: the service alone, sync request timelines, and CPU profiles. The data is in the repo too: `benchmark/bench-anon.dump`, a real shop's database anonymized by `benchmark/anonymize.sql`. `benchmark/README.md` has the steps to rerun everything, from a clone.

The table compares Electric at `240c4e0` with PowerSync at `4731a9d` (runs 21–22). That build still used our vendored copy of the standalone client; `@powersync/standalone-client` 0.1.1 sent the same bytes in the same time (run 27). The SQLite attempt is the tag `bench-powersync-sqlite`.

|                                      | Electric (on-demand subsets)   | PowerSync standalone |
| ------------------------------------ | ------------------------------ | -------------------- |
| Cold/warm page load, sum of 10 pages | 7.6 s                          | 17.5 s               |
| In-app navigation session            | 5.25 s                         | 3.73 s               |
| Bytes per page load (compressed)     | only the rows each query needs | 2.3–4.9 MB           |
| JS heap                              | 15–82 MB                       | 75–146 MB            |

- Navigation is faster with PowerSync, because tables stay in memory. A first load is 2.3× slower, because every page downloads each table it reads in full, again on each load and in each tab.
- **The service is the download bottleneck**: about 60k ops/s, its Node process at 110–130% CPU, Postgres at 18%. zstd, gzip and no compression all take the same time.
- **Compaction matters a lot**: five rounds of updating every row of the two largest tables left 595,859 ops for the same 101,239 rows. The sell order pages went from 2.3–2.7 s to 8.1–8.8 s and from 4.4–4.9 MB to 14–16 MB sent: time and bytes follow the ops, not the rows. `compact` (86 s) brought the store back to the speed of a fresh snapshot, within 6%. A fresh snapshot holds one op per row.

## What we tried

| Idea                                                                                                                         | Result                                                                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Compression at the proxy                                                                                                     | Not needed: the service already compresses by `Accept-Encoding`                                                                                                                              |
| Subscribing to every stream at startup                                                                                       | Navigation got faster, first loads slower (1.6 → 2.9 s); rejected                                                                                                                            |
| Inline script that replays the page's last sync request before the JS loads                                                  | Reloads 3% faster, no effect on first visits; removed (it depended on the request format and rewrote `client_id`)                                                                            |
| Faster row conversion                                                                                                        | 2–3% of a load; not worth it                                                                                                                                                                 |
| Committing all the tables of a checkpoint in one TanStack DB transaction                                                     | 24% faster on the heaviest page; kept. Needs a patch to `@tanstack/db` (`withPublicationContext`)                                                                                            |
| Bringing 5 related tables into the first request                                                                             | Same total time, but no wrong UI while the second request was missing                                                                                                                        |
| Hybrid: on-demand subsets from Postgres first, PowerSync stream replaces them (branch `progressive-collections`, runs 25–26) | Cold detail pages 1.5–2.1 s → 0.28–0.38 s (Electric 0.34–0.45 s), cold 10 pages 19.0 → 11.2 s (Electric 8.0 s), but production orders 44% and treatment 9% slower; not merged                |
| Parameterized streams (`sell_order_by_id`, `sell_order_line_by_sell_order`)                                                  | About 11 ms at the service, against about 540 ms for the two full tables (`benchmark/tools/probe-subscriptions.ts`; the two test streams are not in the repo's sync config). Not adopted yet |

## What we already checked in your docs and code

- **Compaction**: self-hosted has to schedule `compact` itself; the docs suggest daily on storage version 2 (the only one Postgres storage offers) and hourly on version 4. We run it every 10 minutes, and it brings a churned store back to the speed of a fresh one.
- **Writes**: tRPC followed by `confirmWrites()` is the client's documented pattern for backend writes. Holding checkpoints back until the write lands is by design.
- **Ids**: `SELECT *, CAST(id AS TEXT) AS id` follows the documented aliasing rule (the last column with a name wins).
- **Shared `sub`**: the service tracks write checkpoints per user and `client_id`, and each tab has its own client id, so confirmations don't mix.
- **By design**: the standalone client keeps no persistence, no multi-tab sharing and no offline writes.

## Questions

1. **Initial sync throughput.** About 60k ops/s per connection, CPU-bound in the service. Can we raise it: service settings, a newer version, MongoDB storage instead of Postgres, more replicas behind the proxy?
2. **Loading only the rows a query needs.** Is there a recommended pattern for TanStack DB (like Electric's on-demand subsets), e.g. a parameterized stream per detail page next to the full-table streams? If a row is in two subscribed streams, is it downloaded twice, once per bucket?
3. **Priorities in the standalone client.** It accepts a per-stream `priority` and applies rows from priority checkpoints, but `waitForSync()` only resolves on a complete checkpoint. Is per-priority readiness planned, so the tables of the first render can show before the rest of the same request?
4. **Standalone client roadmap.** `release()` has a TODO for a TTL, so a stream released on navigation is downloaded again on return. Is that planned? And how stable is the `standalone` API of `@powersync/shared-internals` it builds on?
5. **One checkpoint, one TanStack DB transaction.** We patch `@tanstack/db` to commit all the tables of a checkpoint together (24% faster on the heaviest page). Will an official adapter for the standalone client do this? I created a PR for exporting `withPublicationContext` to make it possible. https://github.com/TanStack/db/pull/2440
6. **Anything else** you would change for a small LAN app with about 100k rows that wants fast first loads.
