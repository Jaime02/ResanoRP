import { execFileSync, execSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const productionPath = "./envs/production";
const binPath = path.join(productionPath, "bin");
const downloadsPath = path.join(binPath, "downloads");
const migrationPath = path.join(productionPath, "src", "db");

const BUN_VERSION = "1.4.4";
const NODE_VERSION = "24.14.0";
const CADDY_VERSION = "2.11.9";
const POSTGRES_VERSION = "16.11-1";
const WINSW_VERSION = "2.12.0";

// Git Bash puts GNU tar first in PATH, which cannot read zip files
const tar = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe");

interface TDownload {
  url: string;
  checksums?: { url: string; algorithm: "sha256" | "sha512" };
}

async function fetchBuffer(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} answered with HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function download({ url, checksums }: TDownload) {
  const fileName = path.basename(url);
  const filePath = path.join(downloadsPath, fileName);
  if (fs.existsSync(filePath)) return filePath;

  fs.mkdirSync(downloadsPath, { recursive: true });
  const content = await fetchBuffer(url);
  if (checksums !== undefined) {
    const line = (await fetchBuffer(checksums.url))
      .toString()
      .split(/\r?\n/)
      .find((entry) => entry.endsWith(fileName));
    const expected = line?.split(/\s+/)[0];
    const actual = createHash(checksums.algorithm).update(content).digest("hex");
    if (expected !== actual) throw new Error(`${fileName} does not match its published ${checksums.algorithm}`);
  }
  fs.writeFileSync(filePath, content);
  return filePath;
}

function extract(archive: string, destination: string, ...options: Array<string>) {
  fs.mkdirSync(destination, { recursive: true });
  execFileSync(tar, ["-xf", archive, "-C", destination, ...options], { stdio: "inherit" });
}

async function downloadBinaries() {
  if (!fs.existsSync(path.join(binPath, "bun.exe"))) {
    const release = `https://github.com/oven-sh/bun/releases/download/bun-v${BUN_VERSION}`;
    const archive = await download({
      url: `${release}/bun-windows-x64.zip`,
      checksums: { url: `${release}/SHASUMS256.txt`, algorithm: "sha256" },
    });
    extract(archive, binPath, "--strip-components=1", "bun-windows-x64/bun.exe");
  }

  if (!fs.existsSync(path.join(binPath, "node.exe"))) {
    const release = `https://nodejs.org/dist/v${NODE_VERSION}`;
    const archive = await download({
      url: `${release}/node-v${NODE_VERSION}-win-x64.zip`,
      checksums: { url: `${release}/SHASUMS256.txt`, algorithm: "sha256" },
    });
    extract(archive, binPath, "--strip-components=1", `node-v${NODE_VERSION}-win-x64/node.exe`);
  }

  if (!fs.existsSync(path.join(binPath, "caddy.exe"))) {
    const release = `https://github.com/caddyserver/caddy/releases/download/v${CADDY_VERSION}`;
    const archive = await download({
      url: `${release}/caddy_${CADDY_VERSION}_windows_amd64.zip`,
      checksums: { url: `${release}/caddy_${CADDY_VERSION}_checksums.txt`, algorithm: "sha512" },
    });
    extract(archive, binPath, "caddy.exe");
  }

  // EnterpriseDB publishes no checksum. The pgAdmin and StackBuilder folders are half of the zip and never used
  if (!fs.existsSync(path.join(binPath, "postgres", "bin", "postgres.exe"))) {
    const archive = await download({
      url: `https://get.enterprisedb.com/postgresql/postgresql-${POSTGRES_VERSION}-windows-x64-binaries.zip`,
    });
    extract(
      archive,
      path.join(binPath, "postgres"),
      "--strip-components=1",
      "--exclude",
      "pgsql/pgAdmin 4",
      "--exclude",
      "pgsql/StackBuilder",
      "--exclude",
      "pgsql/doc",
    );
  }

  // WinSW publishes no checksum either
  const serviceHost = path.join(productionPath, "resanorp-service.exe");
  if (!fs.existsSync(serviceHost)) {
    const archive = await download({
      url: `https://github.com/winsw/winsw/releases/download/v${WINSW_VERSION}/WinSW-x64.exe`,
    });
    fs.copyFileSync(archive, serviceHost);
  }
}

function installPowerSync() {
  const servicePath = path.join(productionPath, "powersync-service");
  const [, version] = /journeyapps\/powersync-service:([\d.]+)/.exec(
    fs.readFileSync("./docker/docker-compose.base.yml", "utf8"),
  )!;
  fs.mkdirSync(servicePath, { recursive: true });
  fs.writeFileSync(path.join(servicePath, "package.json"), JSON.stringify({ private: true }));
  execSync(`npm install --no-audit --no-fund @powersync/service-image@${version}`, {
    cwd: servicePath,
    stdio: "inherit",
  });
}

fs.copyFileSync("./docker/Caddyfile", path.join(productionPath, "Caddyfile"));
fs.copyFileSync("./src/scripts/trust-cert.ps1", path.join(productionPath, "trust-cert.ps1"));
fs.copyFileSync("./src/scripts/production-supervisor.ts", path.join(productionPath, "supervisor.ts"));
fs.cpSync("./docker/powersync", path.join(productionPath, "powersync"), { recursive: true });
// The Docker setup mounts this folder at ./envs/production, here the app runs from it
fs.writeFileSync(
  path.join(productionPath, ".env"),
  fs.readFileSync("./envs/.env.production", "utf8").replaceAll("./envs/production", "."),
);

// refresh.cmd runs the migration on the server, against an empty database built from this schema
fs.writeFileSync(
  path.join(productionPath, "schema.sql"),
  execFileSync("bun", ["run", "drizzle-kit", "export", "--dialect", "postgresql", "--schema", "./src/db/schema.ts"]),
);
fs.rmSync(migrationPath, { force: true, recursive: true });
fs.cpSync("./src/db", migrationPath, {
  recursive: true,
  filter: (source) =>
    fs.statSync(source).isDirectory()
      ? !source.endsWith("__pycache__")
      : [".py", ".txt", ".dll"].includes(path.extname(source)),
});

// The production machine has no source and no internet to build from, so everything it runs ships inside the folder
await downloadBinaries();
installPowerSync();
// Printing a tag renders it in Chromium, so the browser ships too instead of being installed on the server
execSync("bunx playwright install chromium", {
  env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: path.resolve(productionPath, "browsers") },
  stdio: "inherit",
});

execSync("bun ./src/scripts/copy-pdf-worker.ts", { stdio: "inherit" });
execSync("bun run build:css", { stdio: "inherit" });
execSync("bunx vite build", { stdio: "inherit" });
for (const folder of [".output", "public"]) {
  fs.rmSync(path.join(productionPath, folder), { force: true, recursive: true });
  fs.cpSync(folder, path.join(productionPath, folder), { recursive: true });
}

console.debug(`✅ ${productionPath} is ready to copy to the production machine`);
