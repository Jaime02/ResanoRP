# Data loading benchmark

Compares how fast pages show their data on master (ElectricSQL), `powersync` (PowerSync with SQLite) and
`powersync-lite` (PowerSync Lite, in memory). Each branch runs as a production build, side by side, on a copy of the
same database. Later runs compare builds of one branch before and after a change. Conclusions:
`docs/powersync-migration.md` §10–§12 and `docs/query-performance.md` §5; every result file is listed in
[Results](#results).

Run every command from the repository root, in Git Bash.

Setup of every run: one laptop (AMD Ryzen 7 8845HS, 8 cores / 16 threads, 28 GB usable RAM, Windows 11, Docker
Desktop), no CPU or network throttling. PowerSync service `journeyapps/powersync-service:1.28.1` and storage in
Postgres 16, sync config edition 3 with one unparameterized `SELECT *` stream per table
(`docker/powersync/sync-config.yaml`). Clients: Lite is the vendored standalone client until run 27, then
`@powersync/standalone-client` 0.1.1, keeping every row in memory; the SQLite branch is `@powersync/web` 2.7.0 with
SQLite in OPFS; master is `@electric-sql/client` 1.5.28 with on-demand subsets.

Data: `bench-anon.dump`, a real shop's database anonymized by `anonymize.sql`. Every text but the shape names has its
letters and digits replaced (same length, case and punctuation, no two values merged). Prices and costs are scaled by
0.5–1.5, and every date is shifted by the same number of weeks. The random key is discarded. Ids, quantities,
dimensions and statuses are kept, so every page shows the same rows as on the original, which every run in `results/`
measured. The original is not kept. 101,239 rows in 26 tables; every row's id is synced as text. The
largest tables: `delivery_note_line` 26,868, `sell_order_line` 22,594, `sell_order` 13,022, `delivery_note` 8,342,
`invoice` 4,698, `part_reference` 4,149, `part_price` 4,059, `part` 3,647, `part_feature` 2,974,
`production_order` 2,761, `part_production` 2,713, `blueprint` 1,405, `part_price_estimator` 1,089; the other 13 hold
974 rows or fewer.

Since `912b1ca` master is the Lite branch, and the `powersync` and `powersync-lite` branches were deleted. Electric's
last commit is `240c4e0`. The SQLite branch's last measured commit, `83b60e4` (run 6), is on no branch: only the tag
`bench-powersync-sqlite` keeps it.

## Files

| File                | What it is                                                                                                |
| ------------------- | --------------------------------------------------------------------------------------------------------- |
| `benchmark-load.ts` | The benchmark: drives the UI with Playwright and times each page. Usage and modes in its header           |
| `stack.sh`          | Builds one branch's production image and starts it with its own ports and volumes, restoring `bench-anon.dump` |
| `compose.bench.yml` | Compose overlay `stack.sh` adds to the branch's `docker/docker-compose.base.yml`                          |
| `bench-anon.dump`   | The data every stack restores (see Data above)                                                            |
| `anonymize.sql`     | What `stack.sh dump` runs on a throwaway copy of the database before writing `bench-anon.dump`            |
| `churn.sh`          | Fills PowerSync's storage with obsolete operations, to measure compaction                                 |
| `results/`          | Raw output of every run, listed in [Results](#results)                                                    |
| `tools/`            | Diagnostics used to find where the time goes (below)                                                      |
| `stacks/`           | Created by `stack.sh`: each stack's `.env`, Caddy data and logs                                           |

## Before you start

- Docker Desktop running, `bun install`, and Playwright's Chromium installed (`bun run test:install`).
- An env file: `envs/.env.prisma` by default. It is not in the repository: in a clone, prefix the commands of `stack.sh`
  with `SOURCE_ENV=envs/.env.development`. `stack.sh` copies the file's secrets, admin password and `VITE_HOST`
  (`localhost`, so no hosts file change is needed), and changes only the ports, the env name and `NODE_ENV`.
- About 3.5 GB of free disk per stack (its image is 3 GB), and nothing else heavy running: other programs changed absolute times by up to 40%
  between runs.

## Compare the branches

1. Only to replace `bench-anon.dump` with newer data: anonymize a running database (the prisma stack by default, or a
   database container given as an argument). It is piped into a throwaway Postgres container and anonymized there, so
   only the anonymized copy is written to disk. The script fails if any text column is left as it was:

   ```sh
   ./benchmark/stack.sh dump
   ```

2. Start one stack per branch, with free port prefixes (prefix 14 means ports 14080, 14443 and 14000) and Postgres ports.
   Each builds its image in a git worktree in the temp folder, restores the dump and, for PowerSync, waits until the
   service has replicated every table. Given together, the stacks start in parallel and each line of output is
   prefixed with its stack's name. With Docker's build cache all three were up in 55 s to 2 minutes (one after another: 2 minutes each, 5 without the cache):

   ```sh
   ./benchmark/stack.sh up master 240c4e0 14 5437 powersync bench-powersync-sqlite 15 5438 lite master 16 5439
   ```

   Check that each prints `rows restored: 101239`, and the PowerSync ones
   `PowerSync operations: 101239`. The only `pg_restore` error should be `schema "public" already exists`. The command
   fails if any stack failed. Ports 4xxx, 11xxx, 12xxx and 13xxx are taken by the dev, blank, prisma and test
   stacks.

3. Run the benchmark against all of them at once, so they take turns load by load. `5` is the number of loads per page
   and mode, `""` a page name filter (e.g. `"sell order"`). The full run took 50 minutes; the powersync branch's
   17 s first loads take most of it:

   ```sh
   MSYS_NO_PATHCONV=1 bun --env-file=benchmark/stacks/master/.env benchmark/benchmark-load.ts 5 "" \
     master=https://localhost:14443@resanorp-bench-master-caddy-1 \
     powersync=https://localhost:15443@resanorp-bench-powersync-caddy-1 \
     lite=https://localhost:16443@resanorp-bench-lite-caddy-1 | tee benchmark/results/new-run.txt
   ```

   The env file only provides the admin password and `DATABASE_URL`, which picks the ids of the detail pages. Every
   stack holds the same data, so any of them works.

4. Read the table: `data ms` is the median time from the start of the navigation until the page's tables showed data
   that then stayed unchanged for 1.5 s. The `row counts` column must be the same for every target on a page, or they
   did not show the same data. `hydrated ms` is when React hydrated (`body[data-hydrated]`). `sent KB` counts what
   each stack's Caddy sent, including requests from workers; a cold load also downloads the app's scripts (~2 MB:
   Lite's cold minus warm), so Lite's warm `sent KB` is about its sync download alone. `page heap MB` only counts the
   page's main thread.

5. Remove everything (containers, volumes, worktree, image, `stacks/<name>`):

   ```sh
   ./benchmark/stack.sh down master
   ./benchmark/stack.sh down powersync
   ./benchmark/stack.sh down lite
   ```

To benchmark uncommitted changes, commit them to a temporary branch and pass that as the git ref.

## Measure compaction

On a running `lite` stack:

```sh
./benchmark/churn.sh lite 5   # ~2 min: 595,859 operations for the same 101,239 rows
MSYS_NO_PATHCONV=1 bun --env-file=benchmark/stacks/lite/.env benchmark/benchmark-load.ts 3 "sell order" \
  uncompacted=https://localhost:16443@resanorp-bench-lite-caddy-1
MSYS_NO_PATHCONV=1 docker exec resanorp-bench-lite-powersync-1 node service/lib/entry.js compact
```

Then run the benchmark again. To tell compaction apart from the machine's load, measure the compacted stack together
with a fresh one (e.g. `./benchmark/stack.sh up fresh powersync-lite 17 5440`) in the same run, as
`results/5-control-fresh-vs-compacted-vs-master.txt` does.

## Results

Every file in `results/` is the output of one run, 5 loads per page and mode unless noted. The machine's load changed
absolute times by up to 40% between runs, so compare targets only within one file (or one swapped pair). The files do
not record the commits: the targets are named below. "10 pages" is the sum of a mode's page medians, averaged over a
swapped pair.

| File                                                 | Date  | Targets and what the run tested                                                                                            | Result                                                                    |
| ---------------------------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `1-branches.txt`                                     | 11-13 | `master`, `powersync`, `lite`: the branch comparison in `docs/powersync-migration.md` §10                                  | §10                                                                       |
| `2-lite-uncompacted.txt`                             | 11-13 | `lite` after `churn.sh lite 5`                                                                                             | 8.1–8.8 s on the sell order pages                                         |
| `3-lite-compacted.txt`                               | 11-13 | the same stack after `compact`                                                                                             | 2.3–2.7 s                                                                 |
| `4-lite-compacted-vacuum-full.txt`                   | 11-13 | after `VACUUM FULL` of the storage tables too                                                                              | no change                                                                 |
| `5-control-fresh-vs-compacted-vs-master.txt`         | 11-13 | a fresh `lite` stack, the compacted one and `master` in one run                                                            | compacted = fresh                                                         |
| `6-branches-after-fixes.txt`                         | 11-13 | like run 1, after the sell order line status fix and the rc.1.5 update on every branch                                     | §10                                                                       |
| `7-early-sync.txt`, `8-…-stacks-swapped.txt`         | 11-13 | `lite` against the early sync request build (§11), then swapped                                                            | reloads 3.2% sooner, rest within noise; removed                           |
| `9-batched-commit.txt`, `10-…-stacks-swapped.txt`    | 11-13 | `lite` against `batched`: one live query graph run per checkpoint (§11), then swapped                                      | production orders 2.65 → 1.96 s cold (pair average)                       |
| `11-batched-commit-final.txt`, `12-…-swapped.txt`    | 11-13 | the same with the final version of `batched`                                                                               | production orders 2.64 → 2.06 s cold, other pages −10% to +8%; kept       |
| `13-poc-progressive-2026-11-14.txt`                  | 11-14 | `master`, `lite` and `poc`: branch `poc/progressive-collections` (Postgres subsets first, PowerSync after)                 | cold detail pages 0.27–0.37 s; production orders +27%, treatment +22% against lite. Not swapped |
| `14-poc-ssr-parts-2026-11-14.txt`                    | 11-14 | parts list and part page, `poc` with full SSR and master's parts loader                                                          | 215 ms cold (master 296)                                                  |
| `master-vs-lite-2026-11-14.txt`                      | 11-14 | `master` against `lite`, before the query fixes                                                                            | cold 10 pages 7.9 / 17.9 s; navigation 6.1 / 4.7 s                        |
| `15-query-fixes-compare-tables.txt`                  | 11-14 | `tools/compare-tables.ts`: old (`master`, `lite`) and new builds (`master2`, `lite2`, `ps2`) of the query fixes            | every state shows the same tables                                         |
| `16-query-fixes.txt`, `17-…-stacks-swapped.txt`      | 11-14 | `master`, `lite` against the query fixes `master2`, `lite2` (`docs/query-performance.md`), then swapped                    | superseded by 21–22                                                       |
| `18-master-production-orders-variants.txt`           | 11-14 | production orders only, 7 loads: `master` and two variants of its production orders query, `master2` and `master3`        | `master3` 2.20 s cold against 2.63                                        |
| `19-master-vs-master3.txt`, `20-…-stacks-swapped.txt`| 11-15 | `master` against `master3` on every page, then swapped                                                                     | cold 7% sooner but navigation 12% slower: master kept its query (§5)      |
| `21-final-query-fixes.txt`, `22-…-stacks-swapped.txt`| 11-15 | `master` (`d8e3060`), `lite` (`4e55aab`) against the final query fixes `master2` (`240c4e0`), `lite2` (`4731a9d`), then swapped | `docs/query-performance.md` §5, `docs/powersync-migration.md` §12 "Final" |
| `23-poc-on-query-fixes.txt`, `24-…-swapped.txt`      | 11-15 | `master`, `lite` and `poc` rebased on the query fixes, then swapped. The machine was busy: master's times are 30% higher   | cold 10 pages 11.6 s (master 10.4, lite 23.7); navigation 3.6 s           |
| `25-progressive-collections.txt`, `26-…-swapped.txt` | 11-15 | `master`, `lite` and `prog`: branch `progressive-collections` (`79b6df9`..`9f0bf6f` on the query fixes), then swapped      | cold 10 pages 11.2 s (master 8.0, lite 19.0); navigation 2.9 s (6.1, 4.2) |
| `27-standalone-client.txt`                           | 11-15 | `old` (vendored client) against `new` (`@powersync/standalone-client`, `64bd007`), one run, not swapped                    | no difference: cold 21.6 / 21.9 s, navigation 4.65 / 4.64 s               |
| `28-virtualization.txt`                              | 11-21 | `tools/virtualization.ts`: one build (master `51f474e` + the scroll container and row memo fixes) with virtualization on and off | 48 rows: no gain. 2,761 rows: scroll 16.7 / 433 ms frames, pin 44 / 872 ms |

PowerSync with SQLite (`powersync`) was left out after run 6: ~17 s on every first load while it fills SQLite.

## What the results show about PowerSync

Numbers from runs 21–22 (Lite `lite2` against Electric `master2`, swapped pair averaged) unless another source is named.
Details in `docs/powersync-migration.md` §10–§12.

Where a first load goes:

- **The app is not the bottleneck.** Both branches hydrate at ~190 ms (`hydrated ms`). Lite shows data at 1.3–2.2 s, so
  1.1–2.0 s of each first load is the sync download and the live queries. Electric shows the same pages at 0.29–0.67 s,
  except production orders and treatment.
- **The service's CPU limits the download** (§11). While it streams, its Node process uses 110–130% CPU and Postgres
  18%. It sends ~60,000 operations per second. The 7 tables of the sell orders page are 16.3 MB plain, 2.1 MB gzip and
  2.0 MB zstd, and take the same 730–870 ms in all three encodings, so compression saves bytes but no time on
  localhost.
- **Whole tables, even for one row.** With one unparameterized stream per table, a detail page showing one sell order,
  delivery note or part downloads 2.8–4.9 MB of sync data (cold `sent KB` minus ~2 MB of scripts). Lite shows them at
  1.4–2.0 s cold, Electric's on-demand subsets at 0.33–0.43 s. This is most of the gap: cold, the 10 pages add up to
  17.5 s on Lite against 7.6 s on Electric. Parameterized streams were not benchmarked.
- **The exception is production orders.** Electric sends 15.5 MB for that page (its on-demand joins load the related
  rows of every production order) against Lite's 4.7 MB, and Lite shows it sooner: 1.6 s against 2.4 s.
- **Client parsing costs 280–640 ms of CPU per load** (§11, `@powersync/shared-internals` and the standalone client),
  but most of it runs while the service is still sending.
- **Starting the request earlier barely helps** (§11, runs 7–8). An inline script replayed the page's sync request from
  the document, before the scripts loaded, so it started at 18–31 ms instead of ~230 ms. Reloads got only 3.2% faster
  and first loads did not change, so it was removed.

Reloads and navigation:

- **A Lite reload downloads everything again.** Warm `sent KB` is 2.3–4.9 MB on every page and warm times equal cold
  times. Lite keeps no rows between page loads.
- **SQLite in OPFS is slower even with its data stored** (run 1, `@powersync/web` 2.7.0). First loads took 16.5–20.6 s
  while it filled SQLite. Reloads with the data already in OPFS took 2.2–5.6 s, slower than Lite downloading everything
  again (1.6–3.6 s).
- **In-app navigation is where Lite wins.** Tables synced by earlier pages stay in memory, so the 10-page session takes
  3.73 s on Lite against 5.25 s on Electric. A page whose tables are already synced sends 3–231 KB.
- **The cost is memory.** The page heap is 75–154 MB on Lite against 13–82 MB on Electric (main thread only).

Subscriptions:

- **A new subscription restarts the sync request** (§10). On a sell order page, the rows mount components whose queries
  need 6 more tables, and the client opens a second request. That request resumes the first one's buckets and downloads
  nothing twice. The first request carried 44,991 operations in 656 ms, the second 10,791 in 156 ms. Fetching all 14
  tables in the first request saves no time. A lower priority for the late tables within that one request could save up
  to ~150 ms.

Compaction (runs 2–5):

- **The service never compacts on its own.** Five rounds of updating and restoring every row of `sell_order_line` and
  `delivery_note_line` left 595,859 operations for the same 101,239 rows. The sell order pages went from 2.3–2.7 s to
  8.1–8.8 s, and the bytes sent from 4.4–4.9 MB to 14–16 MB: time and bytes follow the operations, not the rows.
- `compact` took 86 s (7.6 s on a store already compacted) and brought the store back to the speed of a fresh snapshot,
  within 6%. `VACUUM FULL` of the storage tables changed nothing. The app now runs `compact` on a schedule (the
  `powersync-compact` service).

Client package (run 27): `@powersync/standalone-client` 0.1.1 sends the same bytes (±6 KB) and takes the same time as
the vendored copy it replaced.

## Tools

Each takes the stack's env file (`--env-file=benchmark/stacks/<name>/.env`) and has its usage in its first lines.

PowerSync service, without a browser:

- `tools/probe.ts`: how fast the service streams every table of the branch's sync config.
- `tools/probe-encoding.ts`: `probe.ts` for chosen streams and an `ENC=identity|gzip|zstd` request encoding.
- `tools/probe-subscriptions.ts`: how fast the service answers a set of subscriptions, including parameterized streams.

Page loads:

- `tools/streams.ts`: which streams (tables) each page subscribes to.
- `tools/timeline.ts`: when the sync request starts, its first and last byte, and when the data shows.
- `tools/requests.ts`: every request of a page load; the loads share a profile, so all but the first are reloads.
  `CLEAR_STORAGE=1` empties `localStorage` after each load, `INIT_STORAGE=<key>` sets a key.
- `tools/sync-requests.ts`: each sync request of a page, its streams, how many buckets it resumes and when its
  checkpoint completes, next to when the rows show.
- `tools/nav-timeline.ts`: every change of the tables during one in-app navigation, with their rows and characters.
- `tools/write-check.ts`: saves on a first load and on a reload, with the time to the toast and the client ids.
- `tools/profile-one.ts`: CPU profile of a page load, top functions by self time.
- `tools/profile-nav.ts`: CPU profile of an in-app navigation to a page whose data is already in memory.

Rendering:

- `tools/virtualization.ts`: the production orders table showing every row, with its rows virtualized or all rendered,
  in one build that reads the `bench-virtualized` localStorage key. `PROFILE="<row set>|<mode>"` profiles one cell's
  show all click.

Same data on every build:

- `tools/compare-tables.ts`: opens the same table states on several stacks and checks each group shows the same tables.
- `tools/query-bench/`: runs the slow tables' queries over the benchmark data in memory, outside the browser, before
  (`old/`, not in git: `git show HEAD:src/queries/<name>.ts > old/<name>.ts` before the change) and after it, and
  checks they give the same rows (`docs/query-performance.md` §6). `exp.ts` times each piece of a query, `analyze.ts`
  lists the top functions of a `.cpuprofile` (`prof/`).

Progressive collections (master's on-demand subsets and the PoC's Postgres subsets):

- `tools/subsets.ts`: which subsets of each table a master page asks for, and how much it gets.
- `tools/subset-requests.ts`: every Postgres subset request of a first load on a progressive build, with its size.

## Traps

- Each stack needs its own `VITE_ENV_NAME` (`stack.sh` sets `bench-<name>`): compose names volumes and networks after
  it, so two stacks sharing one write to the same database and corrupt it.
- Git Bash turns arguments starting with `/` into Windows paths: keep `MSYS_NO_PATHCONV=1`.
- The prisma stack syncs `src/` into its container. Writing under `src/` while benchmarking it reloads its open pages.
- A table disabled behind a message keeps skeleton rows; the benchmark ignores tables marked `inert`. A page whose data
  is not in a table (e.g. a client) cannot be measured.
- The same build measured ~8% slower on one stack than on another (4–17% per cell). To compare two builds, run them
  twice with the builds swapped between the stacks and average, or switch the change on and off in one build on one
  stack. To swap, start a stack's app with the other image:
  `BENCH_IMAGE=resanorp-app:bench-<other> docker compose -p resanorp-bench-<name> ... up -d --wait app-bench` (the
  `compose` function of `stack.sh` shows the full arguments).
- A docker build running during a measurement inflates it by ~30%.
