Vendored from `@powersync/tanstack-db-lite`, which is not published on npm:
https://github.com/powersync-ja/powersync-js/tree/6de226757f13ca77e559cf4f58d6f6d7b5307c6a/packages/tanstack-db-lite/src

Only the connection client (`client.ts`, `subscriptions.ts`) is kept, unmodified. Its collection adapter targets an older
TanStack DB and string keys, so `src/collections/base.ts` has its own. Replace this folder with the package once it is
published.
