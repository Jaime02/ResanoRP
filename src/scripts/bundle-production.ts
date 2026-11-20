import { execFileSync } from "node:child_process";
import path from "node:path";

const productionPath = "./envs/production";
// --update leaves out what only changes when the app or its tools do, so a new .env or new scripts do not mean copying
// the whole bundle again
const isUpdate = process.argv.includes("--update");
const bundlePath = isUpdate ? "./envs/production-update.zip" : "./envs/production.zip";
const toolEntries = ["powersync-service", "bin", "browsers", ".output", "public", "resanorp-service.exe"];
// backups, caddy, pgdata, LOGS, the live data folders and the client's root.crt belong to the machine they were made on.
// bin/downloads only caches the archives bin was extracted from
const entries = [
  ".env",
  "Caddyfile",
  "trust-cert.ps1",
  "powersync",
  ...(isUpdate ? [] : toolEntries),
  "start.cmd",
  "install.cmd",
  "backup.cmd",
  "cleanup-backups.ps1",
  "restore.cmd",
  "refresh.cmd",
  "schema.sql",
  "src",
  "supervisor.ts",
  "resanorp-service.xml",
  "client/setup.cmd",
];

// Git Bash puts GNU tar first in PATH, which cannot write zip files
const tar = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe");
// Without UTF-8 headers the blueprint names (Ø, º...) are written in the OEM codepage and come out garbled
execFileSync(
  tar,
  [
    "-a",
    "-cf",
    bundlePath,
    "--options",
    "zip:hdrcharset=UTF-8",
    "--exclude",
    "bin/downloads",
    "-C",
    productionPath,
    ...entries,
  ],
  { stdio: "inherit" },
);

console.debug(`✅ ${bundlePath} is ready to copy to the production machine`);
