import { initTRPC, TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import { ZodError } from "zod";

import type { TDatabase } from "@/db";
import { ADMIN_ONLY_MESSAGE } from "@/messages/common";
import { formatZodError } from "@/schemas/utils";

export type Context = {
  db: TDatabase;
  isAdmin: boolean;
};
const t = initTRPC.context<Context>().create({
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

export const router = t.router;
export const procedure = t.procedure;

export const adminProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.isAdmin) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: ADMIN_ONLY_MESSAGE,
    });
  }
  return next();
});

// Helper function to generate transaction ID for Electric sync
export async function generateTxId(tx: TDatabase): Promise<number> {
  // The ::xid cast strips off the epoch, giving you the raw 32-bit value
  // that matches what PostgreSQL sends in logical replication streams
  // (and then exposed through Electric which we'll match against in the client).
  const result = (await tx.execute(sql`SELECT pg_current_xact_id()::xid::text as txid`)) as {
    rows: Array<{ txid?: string }>;
  };
  const txid = result.rows[0]?.txid;

  if (txid === undefined) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Error al generar el ID de transacción",
    });
  }

  return parseInt(txid, 10);
}
