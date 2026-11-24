import { spawn, spawnSync } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const bin = path.join(root, "bin");
const postgresBin = path.join(bin, "postgres", "bin");

const RESTART_DELAY_MS = 3000;
const DATABASE_POLL_MS = 2000;
const DATABASE_ATTEMPTS = 60;
const DATABASE_SERVICE = "ResanoRP-db";
const DATABASE_SERVICE_CHECK_MS = 30_000;
const APP_PORT = "5173";
const POWERSYNC_PORT = "8080";
const LOOPBACK = "127.0.0.1";

function requireEnv(name: string) {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`${name} is missing in .env`);
  }
  return value;
}

const databaseUser = requireEnv("POSTGRES_USER");
const databasePassword = requireEnv("POSTGRES_PASSWORD");
const databaseName = requireEnv("POSTGRES_DB");
const databasePort = requireEnv("POSTGRES_PORT");

function log(name: string, message: string) {
  console.log(`${new Date().toISOString()} [${name}] ${message}`);
}

const encodedPassword = encodeURIComponent(databasePassword);
const databaseHost = `localhost:${databasePort}`;
const powerSyncEntry = path.join(
  root,
  "powersync-service",
  "node_modules",
  "@powersync",
  "service-image",
  "lib",
  "entry.js",
);
const powerSyncEnv = {
  POWERSYNC_CONFIG_PATH: path.join(root, "powersync", "service.yaml"),
  PS_DATA_SOURCE_URI: `postgresql://powersync_role:${encodedPassword}@${databaseHost}/${databaseName}`,
  PS_STORAGE_SOURCE_URI: `postgresql://${databaseUser}:${encodedPassword}@${databaseHost}/powersync_storage`,
  PS_JWT_SECRET: requireEnv("POWERSYNC_JWT_SECRET"),
};

interface TService {
  name: string;
  command: string;
  args: Array<string>;
  env: Record<string, string>;
  before?: () => void;
}

const services: Array<TService> = [
  {
    name: "powersync",
    command: path.join(bin, "node.exe"),
    args: [powerSyncEntry, "start", "-r", "unified"],
    env: powerSyncEnv,
  },
  {
    name: "app",
    command: path.join(bin, "bun.exe"),
    args: ["run", ".output/server/index.mjs"],
    env: {
      PLAYWRIGHT_BROWSERS_PATH: path.join(root, "browsers"),
      PORT: APP_PORT,
    },
  },
  {
    name: "caddy",
    command: path.join(bin, "caddy.exe"),
    args: ["run", "--config", path.join(root, "Caddyfile"), "--adapter", "caddyfile"],
    env: {
      APP_UPSTREAM: `${LOOPBACK}:${APP_PORT}`,
      POWERSYNC_UPSTREAM: `${LOOPBACK}:${POWERSYNC_PORT}`,
      XDG_DATA_HOME: path.join(root, "caddy"),
      XDG_CONFIG_HOME: path.join(root, "caddy-config"),
    },
    // An intermediate that expired while Caddy was stopped still signs the site certificate on the next startup
    // (net::ERR_CERT_DATE_INVALID). A missing one is created before anything is signed. Browsers only trust the root
    before: () => {
      const authority = path.join(root, "caddy", "caddy", "pki", "authorities", "local");
      if (!fs.existsSync(authority)) return;
      for (const file of fs.readdirSync(authority)) {
        if (file.startsWith("intermediate.")) fs.rmSync(path.join(authority, file), { force: true });
      }
    },
  },
];

// PowerSync never compacts its storage on its own, and every change keeps the operations it replaced, which every new
// browser downloads. backup.cmd runs this once a night, next to the running service
if (process.argv[2] === "compact") {
  const result = spawnSync(path.join(bin, "node.exe"), [powerSyncEntry, "compact"], {
    env: { ...process.env, ...powerSyncEnv },
    stdio: "inherit",
  });
  process.exit(result.status ?? 1);
}

const databaseEnv = { ...process.env, PGPASSWORD: databasePassword, POSTGRES_PASSWORD: databasePassword };
const psqlArgs = ["-h", "localhost", "-p", databasePort, "-U", databaseUser];

async function waitForDatabase() {
  for (let attempt = 0; attempt < DATABASE_ATTEMPTS; attempt++) {
    const ready = spawnSync(path.join(postgresBin, "pg_isready.exe"), ["-h", "localhost", "-p", databasePort], {
      stdio: "ignore",
    });
    if (ready.status === 0) return;
    await new Promise((resolve) => setTimeout(resolve, DATABASE_POLL_MS));
  }
  throw new Error("The database did not accept connections in time");
}

// initdb only creates the postgres database, the Docker image used to create this one
function createDatabase() {
  const result = spawnSync(
    path.join(postgresBin, "psql.exe"),
    [...psqlArgs, "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q"],
    {
      env: databaseEnv,
      input: `SELECT format('CREATE DATABASE %I', '${databaseName}') WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${databaseName}')\\gexec`,
      stdio: ["pipe", "inherit", "inherit"],
    },
  );
  if (result.status !== 0) throw new Error(`The ${databaseName} database could not be created`);
}

// Idempotent: it recreates what a restored or recreated database lacks, see powersync/init.sql
function initializePowerSync() {
  const result = spawnSync(
    path.join(postgresBin, "psql.exe"),
    [...psqlArgs, "-d", databaseName, "-v", "ON_ERROR_STOP=1", "-q", "-f", path.join(root, "powersync", "init.sql")],
    { env: databaseEnv, stdio: "inherit" },
  );
  if (result.status !== 0) throw new Error("powersync/init.sql failed");
}

// Windows runs recovery actions only when a service crashes, and pg_ctl's service ends without crashing when PostgreSQL
// exits. Every planned stop of the database stops this service first, so a stopped database here is always unplanned
function watchDatabaseService() {
  setInterval(() => {
    const query = spawnSync("sc", ["query", DATABASE_SERVICE], { encoding: "utf8" });
    if (stopping || query.status !== 0 || !query.stdout.includes("STOPPED")) return;
    log("database", "service stopped, starting it");
    spawnSync("sc", ["start", DATABASE_SERVICE], { stdio: "inherit" });
  }, DATABASE_SERVICE_CHECK_MS);
}

const running = new Map<string, ChildProcess>();
let stopping = false;

function start(service: TService) {
  service.before?.();
  const child = spawn(service.command, service.args, {
    cwd: root,
    env: { ...process.env, ...service.env },
    stdio: "inherit",
  });
  running.set(service.name, child);
  log(service.name, `started, pid ${child.pid}`);
  // A child that fails to spawn emits only error, and one that exits may emit both
  let isRestarting = false;
  const restart = (reason: string) => {
    if (stopping || isRestarting) return;
    isRestarting = true;
    running.delete(service.name);
    log(service.name, `${reason}, restarting`);
    setTimeout(() => {
      if (!stopping) start(service);
    }, RESTART_DELAY_MS);
  };
  child.on("exit", (code) => restart(`exited with code ${code}`));
  child.on("error", (error) => restart(`failed to start: ${error.message}`));
}

function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of running.values()) {
    if (child.pid !== undefined) spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  }
  process.exit(0);
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
process.on("SIGBREAK", stop);

await waitForDatabase();
createDatabase();
initializePowerSync();
for (const service of services) start(service);
watchDatabaseService();
