import { createHash } from "node:crypto";

import { eq } from "drizzle-orm";
import { z } from "zod";

import db from "@/db";
import { dbTableAuditLog } from "@/db/schema";
import { getAuditLogMonth, getAuditRouterDocument } from "@/lib/backoffice";
import logger from "@/logging/logger";
import { LogMessages } from "@/logging/types";

export const AUDIT_REDACTED_VALUE = "***";
// The settings of a transaction that tell the procedure that opened it and the input it was called with, which the
// tests read from every row written
export const AUDIT_PROCEDURE_SETTING = "audit.procedure";
export const AUDIT_INPUT_SETTING = "audit.input";
// The schema where the tests trace every write, which is not part of the app's schema
export const WRITE_TRACE_SCHEMA = "write_trace";
const REDACTED_KEY_PATTERN = /password/i;

export const ADMIN_SESSION_AUDIT_PATHS = { login: "adminSession.login", logout: "adminSession.logout" };
export const ADMIN_LOGIN_ERROR_CODES = { locked: "TOO_MANY_REQUESTS", wrongPassword: "UNAUTHORIZED" };

export interface AuditEntry {
  path: string;
  ok: boolean;
  ip: string | undefined;
  isAdmin?: boolean;
  errorCode?: string;
  input?: unknown;
  resultId?: string;
  documentId?: string;
}

const auditResultSchema = z.object({ item: z.object({ id: z.union([z.number(), z.string()]) }) });

// The input of a create has no id, so the entry takes the one of the row the mutation returns. As text, as some keys are
// not numbers
export function getAuditResultId(data: unknown) {
  const id = auditResultSchema.safeParse(data).data?.item.id;
  return id === undefined ? undefined : String(id);
}

const toAuditId = (value: unknown) =>
  typeof value === "number" || typeof value === "string" ? String(value) : undefined;
const readAuditId = (value: unknown, key: string) =>
  typeof value === "object" && value !== null ? toAuditId((value as Record<string, unknown>)[key]) : undefined;

/**
 * The document a mutation changed, the parent one for a line: from the row it returns, else from its input. A failed
 * delete or restore of a line only sends the id of the line, so its parent is read from the line, if it still exists.
 */
export async function getAuditDocumentId(path: string, data: unknown, input: unknown) {
  const routerDocument = getAuditRouterDocument(path);
  if (routerDocument === undefined) {
    return undefined;
  }
  const { documentRouter, lineTable } = routerDocument;
  const item = typeof data === "object" && data !== null ? (data as { item?: unknown }).item : undefined;
  const parentKey = `${documentRouter}Id`;
  if (lineTable === undefined) {
    return readAuditId(item, "id") ?? toAuditId(input) ?? readAuditId(input, "id") ?? readAuditId(input, parentKey);
  }
  const parentId = readAuditId(item, parentKey) ?? readAuditId(input, parentKey);
  const lineId = Number(readAuditId(input, "id"));
  if (parentId !== undefined || !Number.isInteger(lineId)) {
    return parentId;
  }
  const [line] = await db.select().from(lineTable).where(eq(lineTable.id, lineId));
  return readAuditId(line, parentKey);
}

// Two calls of a procedure with the same input are the same call as far as what they write is concerned
export function getAuditInputKey(input: unknown) {
  return createHash("sha1")
    .update(String(JSON.stringify(redactAuditInput(input))))
    .digest("hex");
}

export function redactAuditInput(value: unknown): unknown {
  if (value instanceof File) {
    return { name: value.name, size: value.size };
  }
  if (value instanceof FormData) {
    return redactAuditInput(Object.fromEntries(value.entries()));
  }
  if (Array.isArray(value)) {
    return value.map(redactAuditInput);
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        REDACTED_KEY_PATTERN.test(key) ? AUDIT_REDACTED_VALUE : redactAuditInput(entry),
      ]),
    );
  }
  return value;
}

// A failed write is logged but never fails the action it records
export async function writeAuditEntry({ input, ...entry }: AuditEntry) {
  try {
    const timestamp = new Date();
    await db.insert(dbTableAuditLog).values({
      ...entry,
      input: input === undefined ? null : JSON.stringify(input),
      month: getAuditLogMonth(timestamp),
      timestamp,
    });
  } catch (error) {
    logger.error(LogMessages.auditWriteFailed, { error, path: entry.path });
  }
}
