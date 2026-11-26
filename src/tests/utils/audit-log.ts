import fs from "node:fs";
import { isIP } from "node:net";
import path from "node:path";

import { expect, test } from "@playwright/test";
import type {
  APIResponse,
  BrowserContext,
  Request as PlaywrightRequest,
  Response as PlaywrightResponse,
} from "@playwright/test";
import type { AnyRouter } from "@trpc/server";
import { getTableName } from "drizzle-orm";

import { dbTableAuditLog } from "@/db/schema";
import { ADMIN_SESSION_COOKIE_NAME, isAdminSession } from "@/lib/admin-session";
import type { AuditEntry } from "@/logging/audit";
import { getAuditDocumentId, getAuditInputKey, getAuditResultId, redactAuditInput } from "@/logging/audit";
import { MUTATION_MESSAGES } from "@/messages/mutations";
import { AUDIT_TABLES_ATTACHMENTS } from "@/tests/utils/audit-tables";
import type { TPickedFiles } from "@/tests/utils/components/file-input";
import { readAppWrites, resetWriteTrace } from "@/tests/utils/write-trace";
import type { TTracedWrite } from "@/tests/utils/write-trace";
import type { TProcedureMeta } from "@/trpc";
import { TRPC_URL } from "@/trpc/trpc-client";
import { ToastType } from "@/types/toast";

export const LOG_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

// The public type of a procedure leaves out what it was built with
interface TBuiltProcedure {
  _def: { type: string; middlewares: Array<unknown>; meta?: TProcedureMeta };
}

export async function readMutations() {
  const { appRouter } = await import("@/trpc/app-router");
  // The type of appRouter nests the routers, but at runtime every procedure is in the same record, by its full path
  const router: AnyRouter = appRouter;
  return Object.entries(router._def.procedures as Record<string, TBuiltProcedure>).filter(
    ([, procedure]) => procedure._def.type === "mutation",
  );
}

export async function readDeclaredWrites(): Promise<Record<string, Array<string> | undefined>> {
  return Object.fromEntries(
    (await readMutations()).map(([path, { _def }]) => [path, _def.meta?.writes.map((table) => getTableName(table))]),
  );
}

// The ip is the address of the browser, as the server sees it, and the timestamp the moment of the write. Both are
// checked apart, as the test does not know them
type TExpectedAuditEntry = Omit<AuditEntry, "ip">;
type TAuditLogEntry = AuditEntry & { timestamp: Date };

interface TTrpcResult {
  result?: { data?: unknown };
  error?: { data: { code: string } };
}

interface TMutationCall {
  entry: TExpectedAuditEntry;
  rawInput: unknown;
}

// Each worker runs a single test at a time, so what the current test did can live in the module
let calls: Array<TMutationCall> = [];
let declaredEntries: Array<TExpectedAuditEntry> = [];
let problems: Array<string> = [];
let recordings: Array<Promise<void>> = [];
let successToastTitles: Array<string> = [];
const unansweredMutations = new Set<PlaywrightRequest>();
const pickedFiles = new Map<string, File>();
// A request held by the test meets the session it has when the test releases it, not the one it was sent with
const releasedSessions = new Map<string, boolean>();

export function setReleasedSession(procedurePath: string, isAdmin: boolean) {
  releasedSessions.set(procedurePath, isAdmin);
}
const trackedContexts = new WeakSet<BrowserContext>();

// Oldest first, in the shape of the entry the app wrote: the columns it left empty are undefined
export async function readAuditLog(): Promise<Array<TAuditLogEntry>> {
  const db = (await import("@/db")).default;
  const rows = await db.select().from(dbTableAuditLog).orderBy(dbTableAuditLog.id);
  return rows.map(({ id: _id, month: _month, documentId, errorCode, input, ip, isAdmin, resultId, ...row }) => ({
    ...row,
    documentId: documentId ?? undefined,
    errorCode: errorCode ?? undefined,
    input: input === null ? undefined : (JSON.parse(input) as unknown),
    ip: ip ?? undefined,
    isAdmin: isAdmin ?? undefined,
    resultId: resultId ?? undefined,
  }));
}

// The db fixture empties the audit log with every other table
export async function resetAuditLog() {
  calls = [];
  declaredEntries = [];
  problems = [];
  recordings = [];
  successToastTitles = [];
  unansweredMutations.clear();
  pickedFiles.clear();
  releasedSessions.clear();
  await resetWriteTrace();
}

// Chromium leaves out of the request it reports the bytes of a file picked from disk, so the test keeps the files it
// picked to know what was uploaded
export function recordPickedFiles(files: TPickedFiles) {
  for (const file of [files].flat()) {
    const picked =
      typeof file === "string"
        ? new File([new Uint8Array(fs.readFileSync(file))], path.basename(file))
        : new File([new Uint8Array(file.buffer)], file.name);
    pickedFiles.set(picked.name, picked);
  }
}

// The entries of what the browser sends to the tRPC API are expected on their own. The ones of anything else, like the
// admin session, are declared by the test
export function expectAuditLog(...entries: Array<TExpectedAuditEntry>) {
  declaredEntries.push(...entries);
}

// A mutation sent from outside the page, which writes the database but is not seen by the browser
export async function expectAuditedRequest(entry: TExpectedAuditEntry, sendRequest: () => Promise<APIResponse>) {
  const response = await sendRequest();
  const { result } = (await response.json()) as TTrpcResult;
  calls.push({
    entry: {
      ...entry,
      resultId: getAuditResultId(result?.data),
      documentId: await getAuditDocumentId(entry.path, result?.data, redactAuditInput(entry.input)),
    },
    rawInput: entry.input,
  });
  return response;
}

// Every mutation of a tab of the context, whatever the page that sent it. Queries are GET requests
export async function trackAuditedMutations(context: BrowserContext) {
  if (trackedContexts.has(context)) {
    return;
  }
  trackedContexts.add(context);
  // The toasts are read as they appear, as a test closes them and a reload loses them
  await context.exposeFunction(TOAST_BINDING, (title: string) => {
    successToastTitles.push(title);
  });
  await context.addInitScript(observeSuccessToasts, { binding: TOAST_BINDING, type: ToastType.Success });
  // Only an intercepted request keeps the body of its upload, which the check reads
  await context.route(`**${TRPC_URL}/**`, async (route) => route.fallback());
  context.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname.startsWith(`${TRPC_URL}/`)) {
      unansweredMutations.add(request);
    }
  });
  context.on("requestfailed", (request) => {
    if (unansweredMutations.delete(request)) {
      problems.push(`${request.url()} failed: ${request.failure()?.errorText}`);
    }
  });
  context.on("response", (response) => {
    if (unansweredMutations.delete(response.request())) {
      recordings.push(recordMutations(response.request(), response));
    }
  });
}

const TOAST_BINDING = "recordSuccessToast";

// Runs in the browser, so it cannot use anything of the module
function observeSuccessToasts({ binding, type }: { binding: string; type: string }) {
  const seen = new WeakSet<Element>();
  new MutationObserver(() => {
    for (const toast of document.querySelectorAll(`[data-testid="toast-root"][data-type="${type}"]`)) {
      const title = toast.querySelector('[data-testid="toast-title"]')?.textContent;
      if (title !== undefined && title !== "" && !seen.has(toast)) {
        seen.add(toast);
        void (window as unknown as Record<string, (title: string) => Promise<void>>)[binding](title);
      }
    }
  }).observe(document, { characterData: true, childList: true, subtree: true });
}

export async function settleTrackedMutations() {
  while (recordings.length > 0) {
    await Promise.all(recordings.splice(0));
  }
}

async function recordMutations(request: PlaywrightRequest, response: PlaywrightResponse) {
  try {
    const url = new URL(request.url());
    const paths = url.pathname.slice(TRPC_URL.length + 1).split(",");
    const inputs = await readInputs(request, paths.length, url.searchParams.has("batch"));
    const body = (await response.json()) as TTrpcResult | Array<TTrpcResult>;
    const results = Array.isArray(body) ? body : [body];
    const releasedSession = releasedSessions.get(paths[0]);
    releasedSessions.delete(paths[0]);
    const isAdmin =
      releasedSession ?? isAdminSession(getCookie((await request.allHeaders()).cookie, ADMIN_SESSION_COOKIE_NAME));
    // Read as the response arrives, as close as it gets to when the server read the document of the entry
    calls.push(
      ...(await Promise.all(
        paths.map(async (procedurePath, index) => {
          const { error, result } = results[index];
          const input = redactAuditInput(inputs[index]);
          return {
            entry: {
              path: procedurePath,
              ok: error === undefined,
              isAdmin,
              ...(error === undefined ? { resultId: getAuditResultId(result?.data) } : { errorCode: error.data.code }),
              documentId: await getAuditDocumentId(procedurePath, result?.data, input),
              input,
            },
            rawInput: inputs[index],
          };
        }),
      )),
    );
  } catch (error) {
    problems.push(`${request.url()} could not be read: ${String(error)}`);
  }
}

// A batch sends the inputs of its procedures by position. The ones with files are sent alone, as the form
async function readInputs(request: PlaywrightRequest, count: number, isBatch: boolean) {
  const contentType = (await request.allHeaders())["content-type"] ?? "";
  if (contentType.startsWith("multipart/form-data")) {
    const body = new Uint8Array(request.postDataBuffer()!);
    const form = await new Response(body, { headers: { "content-type": contentType } }).formData();
    for (const [key, value] of [...form.entries()]) {
      if (value instanceof File && value.size === 0) {
        form.set(key, pickedFiles.get(value.name) ?? value);
      }
    }
    return [form];
  }
  const body = request.postDataJSON() as Record<string, unknown> | null;
  return isBatch ? Array.from({ length: count }, (_, index) => body?.[index]) : [body ?? undefined];
}

function getCookie(cookies: string | undefined, name: string) {
  return cookies
    ?.split("; ")
    .find((cookie) => cookie.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

// Sorted by their content, so that two lists with the same entries, repeated or not, are equal in any order
function canonical(entries: Array<unknown>) {
  const sortKeys = (_key: string, value: unknown) =>
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
      : value;
  return entries
    .map((entry) => JSON.stringify(entry, sortKeys))
    .sort()
    .map((entry) => JSON.parse(entry) as unknown);
}

function withoutTimestampAndIp(entry: TAuditLogEntry) {
  return Object.fromEntries(Object.entries(entry).filter(([key]) => key !== "timestamp" && key !== "ip"));
}

// The audit log must have exactly the entries of what the test did, each one with the right fields, and the database
// must have been written only by the mutations that succeeded, with what they were sent
export async function assertAuditLog() {
  // A save with no feedback in the page, like the one of a blurred field, may still be going when the test ends
  await expect
    .poll(() => [...unansweredMutations].map((request) => `${request.url()} got no response`), {
      message: "Every mutation sent by the browser should get a response before the test ends",
    })
    .toEqual([]);
  await settleTrackedMutations();
  expect(problems, "Every mutation sent by the browser should be read").toEqual([]);

  const actualEntries = await readAuditLog();
  const message = "Audit log should have exactly the mutations of the test";
  const expectedEntries = [...calls.map(({ entry }) => entry), ...declaredEntries];
  expect(canonical(actualEntries.map(withoutTimestampAndIp)), message).toEqual(canonical(expectedEntries));

  const ips = new Set(actualEntries.map(({ ip }) => ip));
  for (const ip of ips) {
    expect(isIP(ip ?? ""), `${message}: ${String(ip)} is not an ip address`).not.toBe(0);
  }
  expect(ips.size, `${message}: every request comes from the same browser machine`).toBeLessThanOrEqual(1);

  await assertWrites();
  assertSuccessToasts();
}

// A toast that says a mutation was done must come with that mutation, so a call site cannot show the message of another
function assertSuccessToasts() {
  const doneMessages = new Set(calls.filter(({ entry }) => entry.ok).map(({ entry }) => MUTATION_MESSAGES[entry.path]));
  const mutationMessages = new Set(Object.values(MUTATION_MESSAGES));
  expect(
    [...new Set(successToastTitles)].filter((title) => mutationMessages.has(title) && !doneMessages.has(title)),
    "Success toasts of a mutation that the browser did not send or that failed",
  ).toEqual([]);
}

function describeWrite({ table, operation, newRow, oldRow }: TTracedWrite) {
  return `${operation} ${table} ${String((newRow ?? oldRow)?.id)}`;
}

// Every row the app writes says the procedure of the transaction that wrote it, so the rows are matched to the mutations
// by what they are, not by when they were written
async function assertWrites() {
  const writes = await readAppWrites();
  const succeededPaths = new Set(calls.filter(({ entry }) => entry.ok).map(({ entry }) => entry.path));
  expect(
    writes.filter(({ procedure }) => procedure === null).map(describeWrite),
    "The app wrote rows outside of a mutation transaction: a query writes or a mutation does not use a transaction",
  ).toEqual([]);
  expect(
    writes
      .filter(({ procedure }) => procedure !== null && !succeededPaths.has(procedure))
      .map((write) => `${describeWrite(write)} by ${String(write.procedure)}`),
    "The app wrote rows for a mutation that the browser did not send or that failed",
  ).toEqual([]);

  // The rows of a call are the ones its procedure wrote when it got its input. Calls with the same input write the same
  const declared = await readDeclaredWrites();
  const unstored = calls
    .filter(({ entry }) => entry.ok)
    .flatMap(({ entry, rawInput }) => {
      const inputKey = getAuditInputKey(rawInput);
      const callWrites = writes.filter((write) => write.procedure === entry.path && write.inputKey === inputKey);
      return callWrites.length === 0 &&
        (declared[entry.path]?.length ?? 0) > 0 &&
        MAY_WRITE_NOTHING[entry.path]?.(rawInput) !== true
        ? [`${entry.path}: no row written got the input it was sent: ${JSON.stringify(entry.input)}`]
        : findUnstoredValues(entry.path, rawInput, callWrites);
    });
  expect(unstored, "The rows written by a mutation should have the values it was sent").toEqual([]);

  await assertTablesOfProcedures(writes, declared);
}

function* getScalars(value: unknown, key = ""): Generator<[string, string | number | boolean]> {
  if (value instanceof FormData) {
    yield* getScalars(Object.fromEntries(value.entries()));
  } else if (typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof File)) {
    for (const [childKey, child] of Object.entries(value)) {
      yield* getScalars(child, childKey);
    }
  } else if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    yield [key, value];
  }
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}/;

// What succeeds without writing on purpose: a Colada the Orden de producción already moved is not recorded as used again
const MAY_WRITE_NOTHING: Record<string, (rawInput: unknown) => boolean> = {
  "materialLot.move": (rawInput) => (rawInput as { quantity?: unknown }).quantity === 0,
};

// What the server drops from the input on purpose: an Impresora only keeps the fields of its kind
const INPUT_KEYS_DROPPED_BY_PROCEDURE: Record<string, Array<string>> = Object.fromEntries(
  ["printer.create", "printer.update"].map((procedurePath) => [
    procedurePath,
    ["labelLengthMm", "labelWidthMm", "shareName", "username"],
  ]),
);

function isSameValue(sent: string | number | boolean, stored: unknown) {
  if (typeof sent === "boolean") {
    return stored === sent;
  }
  const sentNumber = Number(sent);
  if (typeof sent === "number" || (sent.trim() !== "" && !Number.isNaN(sentNumber))) {
    return Number(stored) === sentNumber;
  }
  // A blueprint name is stored without the .pdf that its file gets on disk
  return typeof stored === "string" && (stored.trim() === sent.trim() || `${stored.trim()}.pdf` === sent.trim());
}

// Every value that was sent must be in a row written with a column of the same name. The values that are not a column
// of any written row, and the ones that are empty or only spaces or a date, are left out, as the server stores them in
// its own way
function findUnstoredValues(procedurePath: string, rawInput: unknown, writes: Array<TTracedWrite>) {
  // The row as it was before an update has the values the request sent back unchanged, whatever was stored
  const rows = writes.map(({ oldRow, newRow }) => newRow ?? oldRow).filter((row) => row !== null);
  const unstored: Array<string> = [];
  for (const [key, sent] of getScalars(rawInput)) {
    const isChecked =
      !(typeof sent === "string" && (sent.trim() === "" || DATE_PATTERN.test(sent))) &&
      INPUT_KEYS_DROPPED_BY_PROCEDURE[procedurePath]?.includes(key) !== true;
    const rowsWithColumn = rows.filter((row) => key in row);
    if (isChecked && rowsWithColumn.length > 0 && !rowsWithColumn.some((row) => isSameValue(sent, row[key]))) {
      unstored.push(`${procedurePath}: ${key} ${JSON.stringify(sent)} is in no row written`);
    }
  }
  return unstored;
}

// The tables a procedure writes may be a part of the ones it writes in some case, but never another one
async function assertTablesOfProcedures(
  writes: Array<TTracedWrite>,
  declared: Record<string, Array<string> | undefined>,
) {
  const recorded: Record<string, Set<string>> = {};
  for (const { entry } of calls) {
    if (entry.ok) {
      recorded[entry.path] ??= new Set();
    }
  }
  for (const { procedure, table } of writes) {
    if (procedure !== null) {
      (recorded[procedure] ??= new Set()).add(table);
    }
  }
  // The CI merges what every test saw to find the declared tables that none sees written
  await test.info().attach(AUDIT_TABLES_ATTACHMENTS.observed, {
    body: JSON.stringify(
      Object.fromEntries(Object.entries(recorded).map(([procedurePath, tables]) => [procedurePath, [...tables]])),
    ),
    contentType: "application/json",
  });
  expect(
    Object.entries(recorded).flatMap(([procedurePath, tables]) => {
      const extra = [...tables].filter((table) => declared[procedurePath]?.includes(table) !== true);
      return extra.length > 0 ? [`${procedurePath} wrote ${extra.join(", ")}`] : [];
    }),
    "The tables a mutation writes should be in the writes of its meta",
  ).toEqual([]);
}
