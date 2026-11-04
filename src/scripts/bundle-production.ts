import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const productionPath = "./envs/production";
const bundlePath = "./envs/production.zip";
// backups, caddy, LOGS, the live data folders and the client's root.crt belong to the machine they were made on
const entries = [
  ".env",
  "Caddyfile",
  "trust-cert.ps1",
  "docker-compose.yml",
  "start.cmd",
  "images.tar",
  // Only staged by prepare-production --import
  ...(fs.existsSync(path.join(productionPath, "import")) ? ["import"] : []),
  "client/setup.cmd",
];

// Git Bash puts GNU tar first in PATH, which cannot write zip files
const tar = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe");
// Without UTF-8 headers the blueprint names (Ø, º...) are written in the OEM codepage and come out garbled
execFileSync(tar, ["-a", "-cf", bundlePath, "--options", "zip:hdrcharset=UTF-8", "-C", productionPath, ...entries], {
  stdio: "inherit",
});

console.debug(`✅ ${bundlePath} is ready to copy to the production machine`);
