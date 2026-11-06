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

Do not add comments to describe your changes. The code should be self-explanatory.
Comments are only allowed when they are necessary to explain why a change was made, not what the change does.

Instead of running `tsc --noEmit` use `bun run lint`. Do not run linting or formatting unless required and don't run it on the entire project unless you have to. Use `bun run lint src/...` or `bun run lint src/... --fix` to fix issues in a specific file. Oxlint is type-aware and will catch more issues than eslint. Use `bun run format` to format code.

Do not use Python scripts or similar to do simple edits.
