import { createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_SESSION_COOKIE_NAME = "ResanoRP-admin";

// Keyed by the password, so changing it closes every open Administrador session
function getToken(password: string): Buffer {
  return createHmac("sha256", password).update(ADMIN_SESSION_COOKIE_NAME).digest();
}

export function isAdminSession(token: string | undefined): boolean {
  const password = process.env.ADMIN_PASSWORD;
  if (password === undefined || password === "" || token === undefined) return false;
  const expectedToken = getToken(password);
  const receivedToken = Buffer.from(token, "base64url");
  return receivedToken.length === expectedToken.length && timingSafeEqual(receivedToken, expectedToken);
}

export function getAdminSessionToken(password: string): string | undefined {
  const token = getToken(password).toString("base64url");
  return isAdminSession(token) ? token : undefined;
}
