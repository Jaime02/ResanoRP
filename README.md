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

The environment files live in `envs/` (`.env.development`, `.env.test`, `.env.prisma`, `.env.production`, `.env.blank`). Only `.env.test` and `.env.development` are committed.

Once per machine, map the dev host to localhost by adding `127.0.0.1 dev.resanorp` to `C:\Windows\System32\drivers\etc\hosts` (`/etc/hosts` on macOS and Linux). It needs administrator rights.

## Run the application

The first time, run `bun run dev:fresh`: it creates the database schema and seeds it. A plain `bun run dev` against a new database has no tables.

```bash
bun run dev
```

Starts the Docker services (Postgres, PowerSync, Caddy), trusts the local certificate and starts Vite on the host with hot reload. Caddy serves the app over HTTPS using the host configured in `envs/.env.development`.

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

`bun run prepare-production` and `bun run bundle-production` package the build for deployment (output in `envs/production`).

## Tests

End-to-end tests with Playwright, run against a dedicated Docker stack.

```bash
bun run test:install   # once, installs the Playwright browsers
bun run test:up        # builds and starts the test stack, waits until it is ready
bun run test           # opens the Playwright UI
bun run test:stop      # stops the stack
```

The stack runs the built image, so after changing app code run `bun run test:restart` before the tests. `bun run test:serve` starts the stack and follows the app logs. CI (`.github/workflows/test.yml`) runs the tests in 3 shards.

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
envs             Environment files and runtime data
```
