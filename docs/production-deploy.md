# Production deploy

Production runs natively on Windows Server, without Docker: PostgreSQL, PowerSync, the app and Caddy are Windows
processes in one folder on the server, the production folder. The dev machine builds everything into one folder (`envs/production`), zips it, and the zip
is unzipped on the server. The server needs no internet and no source code.

## 1. What runs

| Process    | Run by                                         | Listens on                             | Reached by                     |
| ---------- | ---------------------------------------------- | -------------------------------------- | ------------------------------ |
| PostgreSQL | Windows service `ResanoRP-db` (NetworkService) | `localhost:POSTGRES_PORT`              | app, PowerSync, backup scripts |
| PowerSync  | `supervisor.ts` (`bin\node.exe`)               | 8080                                   | Caddy only                     |
| App        | `supervisor.ts` (`bin\bun.exe .output\…`)      | 5173                                   | Caddy only                     |
| Caddy      | `supervisor.ts` (`bin\caddy.exe`)              | `VITE_CADDY_HTTP_PORT` / `_HTTPS_PORT` | the browsers of the client PCs |

`supervisor.ts` runs inside the Windows service `ResanoRP` (WinSW, `resanorp-service.exe`, as SYSTEM). On start it:

1. waits up to 2 minutes for PostgreSQL,
2. creates the `POSTGRES_DB` database if it is missing (`initdb` only creates `postgres`),
3. runs `powersync/init.sql`, which is idempotent: the `powersync_storage` database, the `powersync` publication, the
   `powersync_role` role with the PostgreSQL password, and its grants,
4. starts PowerSync, the app and Caddy, and restarts any of them 3 s after it exits.

Before every Caddy start it deletes Caddy's intermediate certificate, so an intermediate that expired while Caddy was
stopped is recreated instead of signing the site certificate (`ERR_CERT_DATE_INVALID`).

Only the Caddy ports are opened in the Windows firewall (`install.cmd`). The browser reaches PowerSync through Caddy
under `/powersync/sync/*` on the same origin as the app (`docker/Caddyfile`).

When the service stops, the supervisor kills the process tree of each child (`taskkill /T /F`). WinSW restarts the
service 10 s after a crash and gives it 15 s to stop (`resanorp-service.xml`).

## 2. The server and the clients

- The server is a Windows Server machine on the LAN, with a fixed address (`SERVER_IP` in `.env`).
- The clients open `https://<VITE_HOST>:<VITE_CADDY_HTTPS_PORT>`.
- `VITE_HOST` does not need to be in any DNS: every client PC pins it in its hosts file with `client\setup.cmd`
  (section 7).

## 3. The production folder

`C:\ResanoRP` holds what the zip brings and what the machine creates. The machine's own folders are never in the zip,
so unzipping a new version over the folder keeps them.

| Path                                                                   | From           | What                                                                                                  |
| ---------------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------- |
| `.output\`, `public\`                                                  | zip            | The built app                                                                                         |
| `bin\`                                                                 | zip            | `bun.exe`, `node.exe`, `caddy.exe`, `postgres\` (PostgreSQL binaries)                                 |
| `browsers\`                                                            | zip            | Playwright Chromium, which renders the tags and PDFs                                                  |
| `powersync-service\`                                                   | zip            | `@powersync/service-image` installed with npm                                                         |
| `powersync\`                                                           | zip            | `service.yaml`, `sync-config.yaml`, `init.sql` (copied from `docker/powersync`)                       |
| `resanorp-service.exe`, `.xml`                                         | zip            | WinSW and its service definition                                                                      |
| `supervisor.ts`                                                        | zip            | Copy of `src/scripts/production-supervisor.ts`                                                        |
| `.env`, `Caddyfile`, `trust-cert.ps1`                                  | zip            | Configuration (section 4), copy of `docker/Caddyfile`, copy of `src/scripts/trust-cert.ps1`           |
| `install.cmd`, `start.cmd`                                             | zip            | Section 6                                                                                             |
| `backup.cmd`, `cleanup-backups.ps1`, `restore.cmd`                     | zip            | Section 9                                                                                             |
| `client\setup.cmd`                                                     | zip            | Section 7                                                                                             |
| `import\`                                                              | zip, if staged | Data that `start.cmd` swaps in (section 8)                                                            |
| `pgdata\`                                                              | machine        | The PostgreSQL cluster                                                                                |
| `caddy\`, `caddy-config\`                                              | machine        | Caddy's own certificate authority and state. Losing `caddy\` means every client must trust a new root |
| `BLUEPRINTS\`, `SELL_ORDERS\`, `TAGS\`, `DELIVERY_NOTES\`, `INVOICES\` | machine        | Files of the app                                                                                      |
| `LOGS\`                                                                | machine        | App logs                                                                                              |
| `service-logs\`                                                        | machine        | WinSW logs: the supervisor's output, with PowerSync and Caddy. Rolled at 10 MB, 5 files               |
| `backups\`                                                             | machine        | What an import replaced (section 8)                                                                   |
| `client\root.crt`, `client\host.txt`                                   | machine        | Written by `start.cmd` for the clients (section 7)                                                    |

The nightly backups go to `BACKUP_LOCAL_PATH` (`C:\ResanoRP-backups`), outside this folder.

## 4. Configuration

`envs/.env.production` on the dev machine is the source. It holds secrets and is not in git. `prepare-production`
copies it to `envs/production/.env` and rewrites `./envs/production` to `.`, because the Docker setup mounts the folder
at `./envs/production` while on the server everything runs from the folder itself. Bun loads `.env` from the working
directory when WinSW starts `bun run supervisor.ts`, and every child inherits it.

| Key                                          | Used for                                                                                     |
| -------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `VITE_HOST`, `SERVER_IP`                     | Site name in the `Caddyfile`, and the line `start.cmd` writes to `client\host.txt`           |
| `VITE_CADDY_HTTP_PORT`, `_HTTPS_PORT`        | Caddy's ports and the firewall rules                                                         |
| `POSTGRES_DB`, `_USER`, `_PASSWORD`, `_PORT` | `initdb`, the scripts, PowerSync's connection strings (built by the supervisor)              |
| `DATABASE_URL`                               | The app's connection                                                                         |
| `POWERSYNC_JWT_SECRET`                       | Shared by the app (signs browser tokens) and PowerSync (`PS_JWT_SECRET`)                     |
| `*_ROOT_PATH`, `LOGS_PATH`                   | The data folders, relative to the production folder                                          |
| `BACKUP_LOCAL_PATH`                          | Backup target. Unquoted, because Docker Compose reads `\\` inside double quotes as an escape |
| `ADMIN_PASSWORD`                             | The app's Administrador mode                                                                 |

Changing `POSTGRES_PORT` after the install needs the same change in `pgdata\postgresql.conf`, which `install.cmd`
wrote once.

## 5. Building the bundle (dev machine)

```bash
bun run prepare-production               # build the app and gather everything into envs/production
bun run prepare-production -- --import   # the same, and stage the Prisma environment's data in envs/production/import
bun run bundle-production                # envs/production.zip, the whole folder
bun run bundle-production -- --update    # envs/production-update.zip, without bin, browsers, powersync-service, .output, public and WinSW
```

`prepare-production` (`src/scripts/prepare-production.ts`):

- Downloads the runtimes once into `envs/production/bin` (cached in `bin\downloads`, left out of the zip). Versions are
  pinned in the script: Bun, Node (runs PowerSync), Caddy, PostgreSQL (EnterpriseDB binaries without pgAdmin,
  StackBuilder and docs) and WinSW. Bun, Node and Caddy are checked against their published checksums; EnterpriseDB
  and WinSW publish none. To upgrade one, change its version and delete its file in `bin` (and `bin\postgres` for
  PostgreSQL).
- Installs `@powersync/service-image` with npm, at the version of the `journeyapps/powersync-service` image in
  `docker/docker-compose.base.yml`, so Docker and production run the same PowerSync.
- Installs Playwright Chromium into `envs/production/browsers`.
- Builds the app (`copy-pdf-worker`, `build:css`, `vite build`) and copies `.output` and `public`.
- With `--import`: copies the data folders from `envs/prisma` and a `pg_dump` of the Prisma stack's database
  (`--no-publications --no-privileges`) into `envs/production/import`. Without it, a previous `import` folder is
  deleted, so a stale import is never shipped.

Every file the server needs must be listed in `entries` of `src/scripts/bundle-production.ts`, and a new file in
`envs/production` that is versioned must be added to the exceptions in `.gitignore`.

## 6. First install (server)

1. Install the Visual C++ Redistributable (x64), which the PostgreSQL binaries need.
2. Install Ghostscript, add its `bin` folder (the one with `gswin64c.exe`) to the **system** PATH, and restart the
   machine. The services run as SYSTEM and only read the system PATH, and Windows services only pick up a PATH change
   after a reboot. The printers need it (section 10).
3. Unzip `production.zip` into `C:\ResanoRP`.
4. Run `install.cmd` as administrator. It:
   - checks that the bundle is complete and that `gswin64c` is in the system PATH,
   - creates the cluster in `pgdata` (`initdb`, UTF-8, `en-US`, `scram-sha-256`) and appends to `postgresql.conf`:
     the port, `listen_addresses = 'localhost'`, `wal_level = logical` (PowerSync replicates from it) and
     `max_slot_wal_keep_size = 10GB` (a stopped PowerSync can not fill the disk with WAL),
   - registers `ResanoRP-db` with `pg_ctl register` (automatic, as NetworkService, with full rights on `pgdata`),
   - installs the WinSW service `ResanoRP`, which depends on `ResanoRP-db`,
   - opens the Caddy ports in the firewall (TCP, and UDP on the HTTPS port for HTTP/3),
   - schedules `backup.cmd` daily at 02:00 as SYSTEM (task `ResanoRP-backup`),
   - runs `start.cmd`.

`install.cmd` can be run again: every step skips what already exists, and the firewall rules are recreated.

## 7. Client PCs

`start.cmd` keeps `C:\ResanoRP\client` ready: `setup.cmd`, Caddy's `root.crt` and `host.txt` (`SERVER_IP VITE_HOST`).
Copy that folder to the PC (or open it from a share) and run `setup.cmd` as the user who uses the app. It:

1. pins the name in the hosts file, because some PCs get a public DNS from the router that does not know it. If the
   hosts file already maps the name to that address on one line, it is left alone. Otherwise every line of the name is
   replaced by the new one, so a server that changed its address is not shadowed by its old line. Only this step needs
   administrator: it asks for it, and runs the elevated copy from `%TEMP%`, because an elevated process does not see
   mapped network drives,
2. trusts `root.crt` in the user's certificate store (no administrator needed),
3. removes the other Caddy roots from the user's store. Every Caddy root has the same name, and Firefox fails with
   `SEC_ERROR_BAD_SIGNATURE` on a stale one.

Then restart the browser and open `https://<VITE_HOST>:<VITE_CADDY_HTTPS_PORT>`. Run it again on every PC whenever `caddy\` is lost or
recreated on the server, or the server's address changes.

## 8. Starting, stopping and deploying a new version

`start.cmd` (administrator) is safe to run at any time. It starts `ResanoRP-db`, waits for it, swaps in a staged
`import\`, starts `ResanoRP`, waits up to 2 minutes for the app, trusts the Caddy root on the server
(`trust-cert.ps1 -RemoveOtherCaddyRoots`) and refreshes `client\root.crt` and `client\host.txt`. Both services start
with Windows, so after a reboot it is only needed if one did not come up.

Stopping: `net stop ResanoRP` (app, PowerSync, Caddy), then `net stop ResanoRP-db`. A changed `.env`, `Caddyfile` or
`supervisor.ts` takes effect when `ResanoRP` restarts.

### An import

When `start.cmd` finds `import\`, it:

1. stops `ResanoRP`,
2. dumps the current database to `backups\<yyyyMMdd-HHmmss>\production.dump`,
3. drops and recreates `POSTGRES_DB`, and drops `powersync_storage`. Dropping the databases also drops PowerSync's
   replication slot and its stored rows, so PowerSync replicates the new data from scratch,
4. runs `init.sql`, then `pg_restore` (`--no-owner --no-publications --no-privileges`),
5. moves each data folder in `import\` into place, and the one it replaces into the same `backups\` folder,
6. deletes `import\`.

If a step fails it stops with an error and leaves `ResanoRP` stopped. The previous data is in `backups\`.

### Deploying

There are no database migrations in production. A schema change (a new column, a new table) only reaches it through
an import, which replaces all of its data with the Prisma environment's. So every deploy is an import.

1. Dev machine: `bun run prepare-production -- --import`, then `bun run bundle-production`.
2. Server: `net stop ResanoRP` and `net stop ResanoRP-db` (Windows can not overwrite the binaries of a running
   process), unzip the new `production.zip` over `C:\ResanoRP` (it brings no machine folder, see section 3), and run
   `start.cmd` as administrator.

For a change that needs no new build (only `.env`, the scripts, the PowerSync config or a new import), the update zip
is enough: `bundle-production -- --update`, unzip it over the folder, `net stop ResanoRP` and `start.cmd`.

## 9. Backups and restore

The task `ResanoRP-backup` runs `backup.cmd` every night at 02:00 as SYSTEM. It writes `BACKUP_LOCAL_PATH\<yyyyMMdd>\`
with the database (`production.dump`, `pg_dump -Fc`), `SELL_ORDERS`, `TAGS`, `DELIVERY_NOTES`, `INVOICES` and
`caddy`, plus `BLUEPRINTS` on Sunday night (the Monday folder). `cleanup-backups.ps1` then keeps every backup of the
current week, the latest one of each of the three previous weeks, and the two newest blueprint copies. A run writes
to `<yyyyMMdd>.partial` and replaces the day's folder only once complete, so a half-written backup is never kept or
restored, a failed run (also a second one the same day) leaves the backup already there as it was, and the cleanup
waits for the next run that succeeds. `cleanup-backups.ps1` and `restore.cmd` only see the date folders. Each run is logged in `BACKUP_LOCAL_PATH\backup.log`, which starts again past 1 MB and keeps the previous
one as `backup.old.log`.

The backups are only on the server for now: copying them to another machine is a TODO in `backup.cmd`. A backup on
the server alone is lost with its disk.

To restore, run in the production folder as administrator:

```bat
restore.cmd                         :: latest backup in BACKUP_LOCAL_PATH
restore.cmd 20261117                :: that night's backup in BACKUP_LOCAL_PATH
restore.cmd D:\copies\20261117      :: any backup folder, e.g. one copied from another machine
```

It stages the backup in `import\` with the newest blueprint copy up to that date, asks for confirmation and runs
`start.cmd`, which imports it (section 8) and saves the current data in `backups\` first. `caddy` is only restored on a
machine that has none, so the clients of a running server keep trusting its certificate, and a new server takes over
the old one's.

## 10. Printing

The app prints from the server, so the server must reach every printer configured in the app: the Windows print
shares and the network printers. Without Docker there is no `smbclient` or `brlaser`: share jobs go through
`net use` and `copy /b`, the Brother through Ghostscript's `mswinpr2` and the Windows driver of the printer, and every
conversion needs `gswin64c` in the system PATH (section 6). The details are in `docs/printers.md`.

## 11. Troubleshooting

- **Logs:** `service-logs\` for the supervisor, PowerSync and Caddy (a child that keeps exiting shows there as
  `exited with code …, restarting` every few seconds), `LOGS\` for the app, `BACKUP_LOCAL_PATH\backup.log` for the
  backups. Where PostgreSQL logs when run as a service has not been checked.
- **A port is taken:** Windows reserves TCP port ranges (Hyper-V, WinNAT). Check with
  `netsh interface ipv4 show excludedportrange protocol=tcp`, and what listens with `netstat -ano | findstr :<port>`.
- **The browser warns about the certificate:** the PC trusts an old root. Run `client\setup.cmd` again with the
  current `root.crt`.
- **The page loads but data does not:** PowerSync is down or still replicating. Check `service-logs\`. After an import
  it replicates the whole database again before the first sync.
- **Do not** start a second copy of the supervisor or `bin\postgres` by hand while the services run: both would use
  the same ports and data.

## 12. What has been verified

On a Windows dev machine with a real bundle, without installing the services: `initdb`, an import (including a
leftover replication slot), the supervisor starting the three processes, the app loading and syncing live changes,
`backup.cmd` with its retention, `restore.cmd` staging, a crashed app restarted in ~3 s, and `taskkill /T` leaving no
orphan processes. Also the Windows share connection logic (`docs/printers.md`) and the hosts update of
`client\setup.cmd`, both against test targets.

Not yet verified on a server:

- the service parts of `install.cmd`: `pg_ctl register` as NetworkService, WinSW install/start/stop and its kill of the
  process tree, the service dependency, the firewall rules and the scheduled task as SYSTEM,
- Caddy as SYSTEM, `trust-cert.ps1` on the server, and whether something else already uses the Caddy ports on the server,
- whether the PostgreSQL binaries need the Visual C++ runtime,
- every printer from the server (no paper test was done),
- `backup.cmd` running unattended at 02:00, and the Monday `BLUEPRINTS` copy.

## 13. Files

| Source in the repository                                                                                                                   | On the server       |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- |
| `src/scripts/prepare-production.ts`                                                                                                        | (builds the folder) |
| `src/scripts/bundle-production.ts`                                                                                                         | (zips it)           |
| `src/scripts/production-supervisor.ts`                                                                                                     | `supervisor.ts`     |
| `envs/production/install.cmd`, `start.cmd`, `backup.cmd`, `cleanup-backups.ps1`, `restore.cmd`, `resanorp-service.xml`, `client/setup.cmd` | same names          |
| `docker/Caddyfile`                                                                                                                         | `Caddyfile`         |
| `docker/powersync/`                                                                                                                        | `powersync\`        |
| `src/scripts/trust-cert.ps1`                                                                                                               | `trust-cert.ps1`    |
| `envs/.env.production` (not in git)                                                                                                        | `.env`              |
