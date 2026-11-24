import { createHmac } from "node:crypto";

// Both match client_auth in docker/powersync/service.yaml
const POWERSYNC_JWT_KEY_ID = "resanorp";
const POWERSYNC_JWT_AUDIENCE = "powersync";
// PowerSync accepts up to 24 hours. The browser reuses a token until shortly before it expires, and the sync stream
// reconnects with a new one 30 seconds before
export const POWERSYNC_TOKEN_LIFETIME_SECONDS = 60 * 60;
// Every browser syncs the same rows, so they all share one PowerSync user. An admin session also gets the audit log
const POWERSYNC_USER_ID = "resanorp";
// Read by the stream of audit_log in docker/powersync/sync-config.yaml
const POWERSYNC_ADMIN_ROLE = "admin";

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export function createPowerSyncToken(isAdmin: boolean): string {
  const secret = process.env.POWERSYNC_JWT_SECRET;
  if (secret === undefined || secret === "") {
    throw new Error("Environment variable POWERSYNC_JWT_SECRET is not set");
  }
  const issuedAt = Math.floor(Date.now() / 1000);
  const unsignedToken = `${encodeJson({ alg: "HS256", kid: POWERSYNC_JWT_KEY_ID, typ: "JWT" })}.${encodeJson({
    aud: POWERSYNC_JWT_AUDIENCE,
    exp: issuedAt + POWERSYNC_TOKEN_LIFETIME_SECONDS,
    iat: issuedAt,
    sub: POWERSYNC_USER_ID,
    ...(isAdmin ? { role: POWERSYNC_ADMIN_ROLE } : {}),
  })}`;
  const signature = createHmac("sha256", Buffer.from(secret, "base64url")).update(unsignedToken).digest("base64url");
  return `${unsignedToken}.${signature}`;
}
