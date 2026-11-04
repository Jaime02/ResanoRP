FROM oven/bun:1.4.3 AS base
WORKDIR /app

FROM base AS install
COPY package.json bun.lock ./
COPY patches ./patches
# The cache mount persists between builds, so a dependency bump only downloads
# the packages that actually changed instead of the whole tree.
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile

# Only the Playwright version is extracted, so the browser layer below depends on
# that version alone and survives every other dependency change.
FROM base AS playwright-version
COPY package.json ./
RUN bun -e "console.log(require('./package.json').devDependencies['@playwright/test'])" > /playwright-version

# Printing a tag renders it in headless Chromium, so every environment needs the browser.
# COPY is cached by content, so the ~hundreds of MB of browser and apt packages are
# only downloaded again when the Playwright version itself changes.
FROM base AS browsers
COPY --from=playwright-version /playwright-version /tmp/playwright-version
RUN bunx playwright@$(cat /tmp/playwright-version) install --with-deps chromium

FROM browsers AS prerelease
COPY --from=install /app/node_modules node_modules

# Source is baked in so the container boots with a complete tree on a native
# filesystem. Copied last so editing source never invalidates the bun install layer.
COPY . .

# The pdf.js worker is served from public/ so Vite does not transform it; see
# src/scripts/copy-pdf-worker.ts. Generated here so it always matches the
# pdfjs-dist that react-pdf resolved in this image.
RUN bun ./src/scripts/copy-pdf-worker.ts

# public/styles.css is inlined at runtime when printing a tag (src/files/pdf.tsx).
# Built here because it is no longer committed; the dev server regenerates it on
# source changes (see vite.config.ts).
RUN bun run build:css

# Dev and test keep the prerelease stage and run the dev server; only production pays for the bundle.
FROM prerelease AS production
# envs/ is not in the image and Vite inlines VITE_* variables into the bundle, so a test build needs it from the build
ARG VITE_ENV_NAME
RUN bunx vite build
