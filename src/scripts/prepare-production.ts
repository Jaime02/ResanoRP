import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const prismaCompose =
  "docker compose -p resanorp-prisma --project-directory . -f docker/docker-compose.base.yml -f docker/docker-compose.prisma.yml --env-file ./envs/.env.prisma --profile prisma";
const sourcePath = "./envs/prisma";
const productionPath = "./envs/production";
// Staged instead of written over the data folders so start.cmd swaps it in while production is down
const importPath = `${productionPath}/import`;
// caddy holds each machine's own CA and LOGS are per run, so neither is copied
const folders = ["BLUEPRINTS", "SELL_ORDERS", "TAGS", "DELIVERY_NOTES", "INVOICES"];

fs.copyFileSync("./envs/.env.production", path.join(productionPath, ".env"));
fs.copyFileSync("./docker/Caddyfile", path.join(productionPath, "Caddyfile"));
fs.copyFileSync("./src/scripts/trust-cert.ps1", path.join(productionPath, "trust-cert.ps1"));
fs.cpSync("./docker/powersync", path.join(productionPath, "powersync"), { recursive: true });

fs.rmSync(importPath, { force: true, recursive: true });
// start.cmd replaces the production data with an import, so only `bun run prepare-production -- --import` stages one
if (process.argv.includes("--import")) {
  for (const folder of folders) {
    fs.cpSync(path.join(sourcePath, folder), path.join(importPath, folder), { recursive: true });
  }

  execSync(`${prismaCompose} up -d --wait db`, { stdio: "inherit" });
  // PowerSync's publication is left out, powersync-init creates it again once production starts
  execSync(
    `${prismaCompose} exec -T db sh -c "pg_dump -U $POSTGRES_USER -d $POSTGRES_DB -Fc --no-publications -f /tmp/prisma.dump"`,
    { stdio: "inherit" },
  );
  execSync(`${prismaCompose} cp db:/tmp/prisma.dump ${importPath}/prisma.dump`, { stdio: "inherit" });
}

// The production machine has no source to build from, so every image ships inside the folder
execSync("docker build -f docker/Dockerfile --target production -t resanorp-app:production .", { stdio: "inherit" });
const images = execSync(`docker compose -f ${productionPath}/docker-compose.yml config --images`, { encoding: "utf8" })
  .trim()
  .split(/\s+/);
execSync(`docker save -o ${productionPath}/images.tar ${images.join(" ")}`, { stdio: "inherit" });

console.debug(`✅ ${productionPath} is ready to copy to the production machine`);
