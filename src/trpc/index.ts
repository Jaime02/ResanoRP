import { initTRPC, TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { ZodError } from "zod";

import type db from "@/db";
import type { TDatabase } from "@/db";
import {
  AUDIT_INPUT_SETTING,
  AUDIT_PROCEDURE_SETTING,
  getAuditDocumentId,
  getAuditInputKey,
  getAuditResultId,
  redactAuditInput,
  writeAuditEntry,
} from "@/logging/audit";
import { ADMIN_ONLY_MESSAGE } from "@/messages/common";
import { formatZodError } from "@/schemas/utils";

type TRootDatabase = typeof db;

export type Context = {
  db: TDatabase;
  isAdmin: boolean;
  ip: string | undefined;
  // The cookies of the caller, which the server sends back to itself to read the files it prints, as some need a session
  cookie: string | null;
};

// The tables a mutation may write. The tests fail on a write to any other one
export interface TProcedureMeta {
  writes: Array<PgTable>;
}

const t = initTRPC
  .context<Context>()
  .meta<TProcedureMeta>()
  .create({
    errorFormatter({ shape, error }) {
      return {
        ...shape,
        data: {
          ...shape.data,
          zodError: error.cause instanceof ZodError ? formatZodError(error.cause) : null,
        },
      };
    },
  });

// Only the test build tags, as its database traces every write with the procedure that made it
function tagTransactionsWithProcedure(db: TDatabase, path: string, input: unknown): TDatabase {
  if (process.env.VITE_ENV_NAME !== "test") {
    return db;
  }
  const inputKey = getAuditInputKey(input);
  return new Proxy(db as TRootDatabase, {
    get(target, property) {
      const value: unknown = Reflect.get(target, property, target);
      if (property !== "transaction") {
        return typeof value === "function" ? value.bind(target) : value;
      }
      return async (...[callback, config]: Parameters<TRootDatabase["transaction"]>) =>
        target.transaction(async (tx) => {
          await tx.execute(
            sql`SELECT set_config(${AUDIT_PROCEDURE_SETTING}, ${path}, true), set_config(${AUDIT_INPUT_SETTING}, ${inputKey}, true)`,
          );
          return callback(tx);
        }, config);
    },
  });
}

export const auditMiddleware = t.middleware(async ({ type, path, ctx, getRawInput, next }) => {
  const rawInput = type === "mutation" ? await getRawInput().catch(() => undefined) : undefined;
  const result = await next({
    ctx: { db: type === "mutation" ? tagTransactionsWithProcedure(ctx.db, path, rawInput) : ctx.db },
  });
  if (type === "mutation") {
    const input = redactAuditInput(rawInput);
    const data = result.ok ? result.data : undefined;
    await writeAuditEntry({
      path,
      ok: result.ok,
      ip: ctx.ip,
      isAdmin: ctx.isAdmin,
      ...(result.ok ? { resultId: getAuditResultId(data) } : { errorCode: result.error.code }),
      // The change is already done, so a failed read of the document only leaves it out of the entry
      documentId: await getAuditDocumentId(path, data, input).catch(() => undefined),
      input,
    });
  }
  return result;
});

export const router = t.router;
export const procedure = t.procedure.use(auditMiddleware);

export const adminProcedure = procedure.use(async ({ ctx, next }) => {
  if (!ctx.isAdmin) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: ADMIN_ONLY_MESSAGE,
    });
  }
  return next();
});
