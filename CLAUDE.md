# ResanoRP

Always check @package.json for dependencies and available scripts

Always try to follow the existing code style and patterns. If you are unsure about a pattern, check other files in the project for examples.

Avoid adding ts-ignore or similar lines, ask for permission when you think it's necessary.

Use Bash always, even on Windows. Use PowerShell only when necessary. Use `bunx` to run scripts that require a Node.js environment.

Do not run the tests unless explicitly required.

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
  - `@tanstack/db`: `getServerSnapshot` in `live-query-observer-client.*` needs `&& this.collection`. Without it every e2e test fails with React error #423.
- The PowerSync client in `src/lib/powersync-lite/` is vendored, unmodified and excluded from lint and format (see its README). `@powersync/shared-internals` is pinned to the version it was checked against: its `standalone` API is internal and may change on a bump.
- `oxc-transform-react` looks unused but is loaded dynamically by the React Compiler (`viteReact({ compiler: true })`). Do not remove it or flag it as unused.
