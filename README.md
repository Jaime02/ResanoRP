# ResanoRP

ERP for a manufacturing workshop: clients, parts, sell orders, delivery notes, invoices, production orders, machines and quality control.

Stack: Bun, TanStack Start / Router / DB, tRPC, Drizzle ORM, PostgreSQL + PowerSync, Caddy, Tailwind, Playwright. Everything except the Vite dev server runs in Docker.

## Requirements

- [Bun](https://bun.sh)
- [Docker](https://www.docker.com) with Docker Compose
- Windows: PowerShell (used once by `trust-cert` to trust the local HTTPS certificate)
- Only for the legacy data migration: Python 3 and a Firebird server

## Setup

```bash
bun install
```

The environment files live in `envs/` (`.env.development`, `.env.test`, `.env.prisma`, `.env.production`, `.env.blank`). Only `.env.test` and `.env.development` are committed. Each one needs `POWERSYNC_JWT_SECRET`, 32 random bytes as base64url: `bun -e "console.log(crypto.getRandomValues(Buffer.alloc(32)).toString('base64url'))"`. `.env.production` also needs `BACKUP_LOCAL_PATH`, the folder `envs/production/backup.cmd` backs up to every night.

No hosts file change is needed: each environment is served from `localhost` on its own `VITE_CADDY_HTTPS_PORT` (dev: `https://localhost:4443`).

## Run the application

The first time, run `bun run dev:fresh`: it creates the database schema and seeds it. A plain `bun run dev` against a new database has no tables.

```bash
bun run dev
```

Starts the Docker services (Postgres, PowerSync, Caddy), trusts the local certificate and starts Vite on the host with hot reload. Caddy serves the app over HTTPS using the host configured in `envs/.env.development`, and PowerSync under `/powersync/sync/` of the same origin. PowerSync's logs: `docker logs resanorp-development-powersync-1`. How sync works: [docs/powersync-migration.md](docs/powersync-migration.md).

| Script               | What it does                                                             |
| -------------------- | ------------------------------------------------------------------------ |
| `bun run dev:fresh`  | Wipes the dev volumes, then starts and seeds the database with test data |
| `bun run dev:seed`   | Resets the dev environment and seeds it                                  |
| `bun run dev:stop`   | Stops the dev containers                                                 |
| `bun run dev:up`     | Starts only the Docker services                                          |
| `bun run dev:server` | Starts only the Vite dev server (needs the Docker services up)           |
| `bun run blank`      | Starts an empty environment (no seed data)                               |

## Production build

```bash
bun run build        # builds the Docker image resanorp-app:local
bun run start        # runs it with envs/.env.production
bun run build:start  # both
```

The production server runs without Docker. Building the bundle, installing it, deploying, the client PCs, backups and restore are in [docs/production-deploy.md](docs/production-deploy.md).

## Tests

End-to-end tests with Playwright, run against a dedicated Docker stack.

```bash
bun run test:install   # once, installs the Playwright browsers
bun run test:up        # builds and starts the test stack, waits until it is ready
bun run test           # opens the Playwright UI
bun run test:stop      # stops the stack
```

The stack runs a bundle of the app built in development mode, which keeps the React and TanStack DB warnings the tests fail on, so after changing app code run `bun run test:restart` before the tests. `bun run test:serve` starts the stack and follows the app logs. CI (`.github/workflows/test.yml`) runs the tests in 3 shards.

### Audit checks

Every tRPC mutation is written to the audit log (the `audit_log` table, one row per mutation and admin login or logout, with `password` fields hidden). It syncs to the Backoffice through PowerSync, only for the token of an admin session and the months of its date filter, and the write trace of the tests leaves it out. After each test that passed, the fixtures check that:

- the audit log has exactly the mutations the browser sent, plus the entries the test declared with `expectAuditLog`;
- the app wrote rows only inside the transaction of a mutation that succeeded. The test build tags every `ctx.db.transaction` with its procedure (`src/trpc/index.ts`) and a trigger records every write (`src/tests/utils/write-trace.ts`), so a mutation must do all its writes inside `ctx.db.transaction`;
- a mutation wrote only the tables listed for it in `src/tests/audit-tables.json`, and stored the values it was sent.

A new mutation needs its tables in `audit-tables.json`. Write them by hand, or run its tests with `UPDATE_AUDIT_TABLES=true` to add the ones they saw. A full run (all files, no filter, no shards) also fails when a listed table is never seen written by a test. CI does the same check on all its shards together with `bun run check-audit-tables`.

## Code quality

```bash
bun run lint src/...        # Oxlint (type-aware), add --fix to fix
bun run format              # Oxfmt
bun run format:check
bun run generate-routes     # regenerate the TanStack route tree
```

A git hook (`.githooks`) is installed by `bun install` through `prepare`.

## Database

The schema is in `src/db/schema.ts` and managed with Drizzle (`drizzle.config.ts`).

- `bun run prisma` starts the Prisma environment (`envs/.env.prisma`), used for schema work and the data migration.
- `bun run reset-env:prisma` resets that environment.
- `bun run clean-database` cleans the database.

### Migrating the legacy data

Imports the old Firebird and RAIO databases into Postgres. The connection settings (`DATABASE_URL`, `FB_HOST`, `FB_DATABASE`, `FB_USER`, `FB_PASSWORD`) are read from `envs/.env.prisma`.

1. Start the Prisma environment:

   ```bash
   bun run prisma
   ```

2. Start the Firebird server:

   ```bash
   fbguard -a
   ```

3. Install the Python dependencies:

   ```bash
   pip install -r src/db/requirements.txt
   ```

4. Run the migration (it asks whether to load the RAIO SQL dump first):

   ```bash
   python src/db/main.py
   ```

Progress is written to `src/db/migration.log`.

## Project layout

```
src/components   UI components (dialogs, tables, comboboxes, ...)
src/routes       TanStack Router routes
src/trpc         tRPC routers (server API)
src/db           Drizzle schema and legacy migration scripts
src/schemas      Zod schemas
src/collections  TanStack DB collections
src/scripts      Maintenance and build scripts
src/tests        Playwright tests, workflows and mock data
docker           Dockerfile and compose files per environment
docker/powersync PowerSync service config, sync streams and database init
docs             Design notes (PowerSync migration)
envs             Environment files and runtime data
```
