# ResanoRP

Always check @package.json for dependencies and available scripts

Always try to follow the existing code style and patterns. If you are unsure about a pattern, check other files in the project for examples.

Avoid adding ts-ignore or similar lines, ask for permission when you think it's necessary.

Use Bash always, even on Windows. Use PowerShell only when necessary. Use `bunx` to run scripts that require a Node.js environment.

Do not run the tests unless explicitly required.

Every time you change app behavior, labels or UI, update or add the tests that cover it in the same change, even if the user does not mention tests. Check `src/tests/` for tests, workflows and mock data that reference what you changed.

Before every commit, and after every change to app code, grep `src/tests/` for the test ids, labels, formatters and components the diff touches, and read each assertion that uses them. Check it against the code as it will be committed: an expected value must come from the same function or constant the app renders on that screen (e.g. a formatter used only in a PDF does not apply to the on-screen table). Do not commit while an assertion and the app disagree.

When writing tests:

- Drive them through the user UI. Do not send custom HTTP or tRPC requests (`page.request`), force clicks or use similar hacks to reach states the UI cannot reach.
- Put repeated UI actions in reusable workflows in `src/tests/workflows/`, and reuse the existing ones before writing new ones.
- Keep tests as compact as possible without reducing coverage: merge related scenarios into `test.step`s of one test and share setup instead of repeating it.
- Tests must not repeat hardcoded values from the app code. Import the shared constant or message, or assert on a stable hook (e.g. a `data-*` attribute) instead of the implementation detail.

Do not duplicate hardcoded values (colors, class names, labels, test ids, magic numbers) in app code. Define them once as a constant or message and reuse it.

Do not add comments to describe your changes. The code should be self-explanatory.
Comments are only allowed when they are necessary to explain why a change was made, not what the change does.

Instead of running `tsc --noEmit` use `bun run lint`. Do not run linting or formatting unless required and don't run it on the entire project unless you have to. Use `bun run lint src/...` or `bun run lint src/... --fix` to fix issues in a specific file. Oxlint is type-aware and will catch more issues than eslint. Use `bun run format` to format code.

Do not use Python scripts or similar to do simple edits.

## Gotchas

- E2E tests run against a Docker image that bakes in `src/`. After changing anything under `src/` except `src/tests/`, run `bun run test:restart` before Playwright, otherwise the old build is tested. Test-only edits don't need it.
- `@tanstack/db` is patched (`patches/`, `patchedDependencies`). Bumping its version silently drops the patch from `bun.lock`. Recreate it with `bun patch`, delete the old patch file and its stale `patchedDependencies` entry.
  - `@tanstack/db`: `getServerSnapshot` in `live-query-observer-client.*` needs `&& this.collection`. Without it every e2e test failed with React error #423 under full SSR, which the app uses again. Do not drop it.
  - `@tanstack/db`: the `index.*` files export `withPublicationContext` from `scheduler.*`. `src/collections/base.ts` commits the tables of a PowerSync checkpoint inside it, so the live queries run once per checkpoint (see `docs/powersync-migration.md` §11). The patch file changes without touching `bun.lock`, so a running dev stack needs a rebuild to get it.
- The PowerSync client in `src/lib/powersync-lite/` is vendored, unmodified and excluded from lint and format (see its README). `@powersync/shared-internals` is pinned to the version it was checked against: its `standalone` API is internal and may change on a bump.
- The server renders every route, but only a route whose loader calls `preloadLiveQueries` arrives with its rows. A page must render the same on the server and in the browser, so it must not read the clock while rendering (use `useNow`, or `ssr: "data-only"` on the route). See `docs/ssr.md`.
- Until PowerSync has brought a table, each query's rows come from Postgres (`loadTableSubset`, see `docs/powersync-migration.md` §13). Its access rules must stay in step with `docker/powersync/sync-config.yaml`: a table or column the sync config keeps from a client needs the same rule in `src/db/functions/table-subset.ts`.
- Sync is PowerSync, see `docs/powersync-migration.md` (load the `powersync` skill for sync work). A new table needs a stream named after it in `docker/powersync/sync-config.yaml`, or its collection fails with `Stream "<table>" was not resolved`. Writes go through tRPC and must call `awaitSynced()`.
- A tRPC mutation does all its writes inside `ctx.db.transaction` and declares the tables it writes with `.meta({ writes: [dbTable…] })`, or the audit checks of every e2e test fail (README, "Audit checks").
- A new file the production compose mounts or `start.cmd` reads must also be listed in `entries` of `src/scripts/bundle-production.ts`, or it is missing from `production.zip`.
- `oxc-transform-react` looks unused but is loaded dynamically by the React Compiler (`viteReact({ compiler: true })`). Do not remove it or flag it as unused.
