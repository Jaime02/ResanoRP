# Server rendering

The server renders every route (full SSR; `src/start.ts` sets no `defaultSsr`). A page arrives with its rows only if its
route loader preloads them. Every other page arrives with its loading states and loads its rows in the browser, from
PowerSync. The measurements and the reasoning behind this are in `docs/powersync-migration.md` §13.

## What arrives with rows

Only the parts list (`src/routes/part/index.tsx`). Its loader calls `preloadLiveQueries` with `partTableQueries`
(`src/queries/part.ts`), which `useQueryPartTable` builds its query from too.

## How a preload works

`preloadLiveQueries` (`src/lib/preload-live-queries.ts`) loads the queries in a `DbClient` of its own and hands only
their results to the one rendering the request, so no other query renders rows the browser does not have yet.

- A server render has no PowerSync (its client needs `window`). A collection on the server is ready at once and answers
  every subset from Postgres through `loadTableSubsetFn`, with the same access rules as `docker/powersync/sync-config.yaml`.
- A subset Postgres cannot answer exactly fails the preload. The page renders without the rows and the browser loads
  them itself. A preload also gives up after 5 s. Both are logged at `info` (`liveQueriesPreloadFailed`), as they are
  not errors: the page still works.
- A fetch of a subset that the browser cuts short by leaving the page is logged at `info` too. Any other failure of a
  subset load is an `error`.
- A Date in a filter travels to the server function as `{ type: "date", value: <ISO string> }`
  (`src/lib/table-subset-fns.ts`): a Date made under the test clock is not the global `Date`, which a server function
  cannot send.

## Adding a loader to a page

1. Put the live query in a builder that returns `{ queryKey, query }`, and use it in the component's hook and in the
   loader. A component only picks a preloaded result up when its query has the same key and builds the same query.
2. In the route: `loader: async ({ context }) => { await preloadLiveQueries(context.dbClient, [builder()]); }`.
3. Every subset the query asks for must be one `loadTableSubset` can answer (see `docs/powersync-migration.md` §13),
   or the preload fails and the page gains nothing.

## A page must render the same on the server and in the browser

React reports a hydration error (the e2e tests fail on it) when the two differ. Their clocks and time zones can differ,
so a page must not read the current time while it renders. Use `useNow` (`src/lib/use-now.ts`), which is `null` until
hydrated, or give the route `ssr: "data-only"`, which skips rendering its component on the server. The Backoffice does
the latter, since its audit log note starts at the current month.

## Tests

Nothing checks the HTML of a server render. The e2e tests run against full SSR, so a hydration error fails them.
`src/tests/e2e/table-subset-db.test.ts` covers the subset loading and its access rules.
