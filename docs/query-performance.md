# Query and load performance

What was made faster, why it works, how it was checked and what was tried and dropped. The migration itself and the
first benchmark are in `docs/powersync-migration.md` (§10 and §11); this file is about the live queries and the page
loads built on them. Dates are 2026-11-13 to 2026-11-14.

## 1. Where the time goes

A page load on the PowerSync branches has three costs, in this order of size for the slowest pages:

1. **Live query graphs.** TanStack DB (1.0.0-rc.1.5) compiles each live query into an incremental dataflow (D2). Every
   `join` hashes **all the rows of both sides**, and every `groupBy` aggregates all the rows of its input, whatever the
   `where`, `orderBy` and `limit` that come after keep. The cost of a query is the number of rows that enter its joins,
   not the number that come out. It is paid on the first run, and again each time a table changes.
2. **Download and parsing.** The service sends about 60,000 operations per second (CPU bound, compression makes no
   difference) and the vendored client parses them while it receives. Lite downloads every table a page reads, in full.
3. **React.**

On production orders, with every table already in memory, the live queries alone took ~1.1 s of a 2.5 s load. Only 48 of
the 2,761 production orders are shown, so almost all of that work was joining rows that the status filter then threw
away.

The rule behind every change below: **discard rows before the joins that do not need them, and do not join a table
nothing reads.**

## 2. Production orders: filter by status before the joins (powersync, powersync-lite)

`src/queries/production-order.ts`, `buildFilteredProductionOrders`.

**Before.** Every production order was joined to its sell order line, sell order, part, treatment totals and machine
count, and only then did the status `where` keep the pending and in-production ones (about 50 of 2,761).

**After.** For the statuses that only depend on the production order itself, a candidate subquery discards the rest
first, and the main query inner-joins to it:

- `productionOrderStatusCandidates` gives, for `Deleted`, `InProduction` and `Pending`, a predicate that needs only the
  production order, the quantity produced (`part_production`) and the machines assigned to it. The full status
  predicates still run afterwards, so the candidates only have to be a superset.
- `hasProducedEnough` was split out of `isProducedProductionOrder`, and `isUnproducedCandidate` is "not deleted and not
  produced enough". An unproduced order can be pending or in production, so nothing is lost.
- `statusCandidates` is `ownProductionOrders` (the `partId` and `quantity` filters, which reach the collection before any
  join) joined to `producedQuantities` and left-joined to `assignedMachineCounts`, filtered by the OR of the predicates
  and projected to `{ id }`. `buildFilteredProductionOrders` then does
  `innerJoin({ statusCandidate: candidates }, ...)`, so the sell order lines, sell orders, parts and treatment totals are
  joined for ~50 rows, not 2,761.
- If any selected status has no candidate predicate (completed, in treatment and so on, which keep most rows),
  `statusCandidates` returns `undefined` and the query is exactly what it was before.
- `producedQuantities(q)` and `assignedMachineCounts(q)` were extracted so the candidates and the main query share them.

Why it works: the expensive joins now receive ~50 keys. The cheap part, one `groupBy` over `part_production` and one over
`machine`, still sees every row, but those tables are small next to the four joined ones.

Things that look equivalent and are not:

- **Reading the candidates once** (`q.from({ productionOrder: candidates })` selecting the whole row) was 2.4× slower
  on Lite: the dataflow then carries every column through the candidate stage. Only `{ id }` is projected, and the main
  query reads the collection itself.
- **Narrowing the candidate's columns further** gained nothing.
- **Alias collisions.** `assignedMachineCounts` uses the alias `statusMachine`, never `machine`, which the
  `assignedMachines` include of the table uses. A shared alias leaks the filter into the include and hides the assigned
  machines of the rows.

## 3. Sell orders: join only what is read (all branches)

`src/queries/sell-order.ts`, `buildFilteredSellOrders` and `sellOrderSelectProjection`.

**Before.** Every sell order was left-joined to its pending line counts (a `groupBy` over all sell order lines) and its
client, even with no filter that reads either.

**After.**

- `readsJoinedTables(filters)` is true when a status or a client name filter is present. When it is false the query is the
  collection plus its own filters (`id`, `receptionDate`, `partId`), with no join at all. This is the default view.
- A client name filter alone joins only the client.
- With statuses, the joins are the same as before, in the same order: pending lines first, then the client. The order
  matters: the first variant joined the client first and made the status views slower.
- Sorting by client name used to order by the client joined for the filters, which forces that join for every sell
  order. The sort now left-joins its own `sortClient`, and when a filter also reads joined tables, the filtered query is
  wrapped as a subquery (`q.from({ sellOrder: filtered.select(...) })`) so the sort only joins the clients of the rows
  that survived.
- The filter's client alias stays `statusClient`, apart from the `client` include of the projection, for the same
  alias-leak reason as above.

## 4. Parts: one candidate row per part (powersync-lite, 2026-11-15)

`src/queries/part.ts`, `referencedPartIds` and `buildFilteredParts`.

**Before.** With a reference or client filter, every part was left-joined to all its references and their clients, and
the result was made `distinct()` again after the includes of the projection, since a part with several matching
references came out once per reference. A left join plus `isNull(partReference.deletedAt)` keeps no part without a
reference (`isNull(undefined)` is false), so it was an inner join already.

**After.** `referencedPartIds` filters the references and their clients on their own and projects a distinct
`{ partId }`, and the parts inner-join to it. A part now enters the projection once, so only the material join (which
still fans out) needs the final `distinct()`. The aliases are `referenceCandidate` and `referenceCandidateClient`, apart
from the `partReference` of the includes.

Same rows in the 11 states of the `part` suite of `query-bench`. Query CPU (Lite, medians of 5): reference 551 → 249 ms,
reference + material 454 → 199 ms, client 271 → 113 ms, client + reference 238 → 104 ms; the default view (92 ms) and the
description and material filters are unchanged. Not measured: page loads with the benchmark, and master, where the
subquery becomes its own subset request (see §5).

The other table hooks (invoices, pending delivery notes, part production history, pending prices, pending sell order
lines, clients, machines) take 1–60 ms on the same data and were left as they are.

## 5. Results

### Query CPU (Lite, every table already in memory, one process, medians)

| State                            | Before  | After  |
| -------------------------------- | ------- | ------ |
| production orders, default view  | ~920 ms | 330 ms |
| production orders, in production | 890 ms  | 187 ms |
| production orders, client name   | 1235 ms | 420 ms |
| sell orders, default view        | 179 ms  | 54 ms  |
| sell orders, part filter         | 554 ms  | 127 ms |

### Page loads (benchmark, ms until the tables show data that stays unchanged for 1.5 s)

Old and new builds of every branch ran side by side in one run, then the images were swapped between the stacks and the
two runs averaged, since the same build ran ~8% slower on the second stack. Each cell is the median of 5 loads. Row
counts matched on every target. Data: `benchmark/results/21-final-query-fixes.txt` and
`22-final-query-fixes-stacks-swapped.txt`.

| Page, mode                           | master (old → new) | powersync-lite (old → new) |
| ------------------------------------ | ------------------ | -------------------------- |
| production orders, cold              | 2479 → 2442        | 2141 → 1598 (0.75)         |
| production orders, warm              | 2621 → 2609        | 2174 → 1581 (0.73)         |
| production orders, in-app navigation | 2137 → 2146        | 1068 → 488 (0.46)          |
| sell orders, cold                    | 821 → 668 (0.81)   | 1414 → 1270 (0.90)         |
| sell orders, warm                    | 840 → 672 (0.80)   | 1376 → 1205 (0.88)         |
| sell orders, in-app navigation       | 946 → 505 (0.53)   | 1265 → 1137 (0.90)         |
| whole navigation session             | 5646 → 5250        | 4401 → 3728                |

The other eight pages stayed within the noise (0.96–1.05), as expected: their queries did not change. The delivery
notes and treatment queries were profiled too and have no query CPU problem.

### Why master has no production orders change

Master (Electric) loads each collection **on demand**: every subquery of a live query asks the server for its own subset
of rows. The candidate subquery adds subset requests but the joined tables are still requested for all production orders,
because on-demand loading of a join loads the related rows of every key before the `where` applies. So the change saved
no download, and half of the in-app navigations to the page waited about 3 s longer on the extra requests (one variant
was bimodal, 2.5 s or 5.5 s). Master keeps its original production orders query and takes only the sell orders change.
This is deliberate and is why the two columns above differ.

## 6. How it was checked

- **Same rows.** `benchmark/tools/query-bench/` loads the benchmark database into memory, mocks the collections,
  and runs the committed query file (`old/`) against the new one for 66 states (28 production orders, 18 sell orders,
  9 delivery notes, 11 parts: filters, statuses, pagination, sorts, count and rows queries). The output must be identical
  (`$collectionId` and `$key` are ignored, as they differ per run). `ONLY=<text>`, `TABLE=` and `QUERY=` narrow it.
- **Same pages.** `benchmark/tools/compare-tables.ts` loads 26 URL states (production orders by status, part,
  client name, page 3, sell orders by client name, part pages, ...) on the old and new builds and compares the text of
  the tables. Every state is identical on every branch, with no console errors.
- **Same performance claim.** The benchmark above, interleaved and with swapped images (`benchmark/README.md`).
- **Not run:** the e2e `production-order.test.ts` that covers the status filters. It needs `bun run test:restart`, and
  should run before this is merged.

## 7. Other load gains and what did not work

Details, numbers and the benchmark setup are in `docs/powersync-migration.md` §10 and §11.

- **One graph run per checkpoint.** The live queries ran once per table a checkpoint brings, each time joining the
  tables that had arrived so far. `src/collections/base.ts` now commits all the tables of a checkpoint inside one
  TanStack DB publication (`withPublicationContext`, exported by the `@tanstack/db` patch). In an unminified build this
  made production orders 24% sooner. A `@tanstack/db` bump must recreate the patch (see `CLAUDE.md`).
- **Compaction.** The service never compacts. After five rounds of updating `sell_order_line` and `delivery_note_line`
  the store held 595,859 operations for 101,239 rows and the sell order pages took 8–9 s and sent 14–16 MB. The
  `powersync-compact` service keeps this bounded.
- **Rejected:** compression (the service already compresses by `Accept-Encoding`); leasing a page's streams when the router
  is created (first loads got slower); an early sync request replayed from the document (3% on reloads, 110 lines tied to
  the client's request format); optimising row conversion (2–3% of a load).
- **Proof of concept, merged 2026-11-27 with access rules and server rendering of the parts list** (branch
  `poc/progressive-collections`, then `progressive-collections`; `docs/powersync-migration.md` §13): collections in on-demand mode answered
  first from Postgres by a server function, and replaced by the PowerSync stream when it lands. Cold detail pages went
  from 1.4–2.0 s to 270–370 ms, the same as master (whose speed comes from on-demand subsets, not from server rendering),
  and the in-app navigation session from 4.7 s to 4.2 s. It made production orders (+27%) and treatment (+22%) cold loads
  slower, sent 2–4 MB more per load, and needs a SQL compiler for the subsets, validation, and an e2e run before it is
  real code.

## 8. Writing queries that stay fast

- A `where` after a join does not make the join cheaper. Put every filter on the collection's own columns before the first
  join, and filter by a cheap subset (a candidate `{ id }` subquery) before joining the expensive tables.
- Do not join a table only to use it in a branch that may not run. Build the joins from the filters that are present.
- A `groupBy` subquery aggregates its whole input. Keep its input small (a `where` inside it) and share one definition
  between the places that need it.
- Project only what the next stage reads. Carrying whole rows through a subquery costs more than re-reading the
  collection.
- Subquery and include aliases must be unique in a query: a repeated alias leaks `where` clauses between them.
- On a changed query, run `query-bench` for equal rows and the benchmark for time. In-process timings do not show
  download effects, and the benchmark does not show which query is slow: profile with `tools/profile-nav.ts` first.
- A change can help the PowerSync branches and hurt master, because on-demand loading turns every subquery into a request.
  Measure each branch.
