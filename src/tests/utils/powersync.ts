import fs from "node:fs";
import path from "node:path";
import tls from "node:tls";

import { PowerSyncClient } from "@powersync/standalone-client";
import { getTableName } from "drizzle-orm";

import { getAuditLogStream } from "@/collections/audit-log";
import { dbTableAuditLog } from "@/db/schema";
import { POWERSYNC_PATH } from "@/lib/powersync";
import { createPowerSyncToken } from "@/lib/powersync-token";

const SYNC_TIMEOUT_MS = 30_000;

// The client uses Map.getOrInsertComputed, which the browsers and Bun have but not yet the Node of the test runner
const mapPrototype = Map.prototype as Map<unknown, unknown> & {
  getOrInsertComputed?: (key: unknown, callback: (key: unknown) => unknown) => unknown;
};
mapPrototype.getOrInsertComputed ??= function (this: Map<unknown, unknown>, key, callback) {
  if (!this.has(key)) this.set(key, callback(key));
  return this.get(key);
};

if (process.env.ENV_PATH === undefined) {
  throw new Error("Environment variable ENV_PATH is not set");
}
// Caddy serves PowerSync with a certificate of its own authority
tls.setDefaultCACertificates([
  ...tls.getCACertificates("default"),
  fs.readFileSync(path.join(process.env.ENV_PATH, "caddy/caddy/pki/authorities/local/root.crt"), "utf-8"),
]);

// The ids of the audit log rows the PowerSync service sends to a browser with or without an admin session
export async function readSyncedAuditLogIds(baseURL: string, isAdmin: boolean, months: Array<number>) {
  const client = new PowerSyncClient({
    endpoint: `${baseURL}${POWERSYNC_PATH}`,
    getToken: async () => createPowerSyncToken(isAdmin),
  });
  const ids = new Set<string>();
  const unlisten = client.listen(getTableName(dbTableAuditLog), {
    onChanges: (changes) => {
      for (const [id, row] of changes) {
        if (row === null) ids.delete(id);
        else ids.add(id);
      }
    },
    onError: () => undefined,
  });
  const lease = client.acquireStreams([getAuditLogStream(months)]);
  try {
    await lease.waitForSync(AbortSignal.timeout(SYNC_TIMEOUT_MS));
  } finally {
    lease.release();
    unlisten();
  }
  return [...ids];
}
