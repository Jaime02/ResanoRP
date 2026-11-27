import type { IR, LoadSubsetOptions } from "@tanstack/react-db";
import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { z } from "zod";

import { ADMIN_SESSION_COOKIE_NAME, isAdminSession } from "@/lib/admin-session";

// A TanStack DB expression (IR.BasicExpression) as plain data, which a server function can receive
export type TPlainExpression =
  | { type: "ref"; path: Array<string> }
  | { type: "val"; value?: unknown }
  // The server function cannot send a Date made under a mocked clock, whose constructor is not the global Date
  | { type: "date"; value: string }
  | { type: "func"; name: string; args: Array<TPlainExpression> };

const expressionSchema: z.ZodType<TPlainExpression> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.object({ path: z.array(z.string()), type: z.literal("ref") }),
    z.object({ type: z.literal("val"), value: z.unknown() }),
    z.object({ type: z.literal("date"), value: z.iso.datetime() }),
    z.object({ args: z.array(expressionSchema), name: z.string(), type: z.literal("func") }),
  ]),
);

const subsetRequestSchema = z.object({
  // The rows after a cursor: the ties of its last row, and the next ones
  cursor: z.object({ whereCurrent: expressionSchema, whereFrom: expressionSchema }).optional(),
  limit: z.number().int().nonnegative().optional(),
  offset: z.number().int().nonnegative().optional(),
  orderBy: z
    .array(
      z.object({
        direction: z.enum(["asc", "desc"]),
        expression: expressionSchema,
        nulls: z.enum(["first", "last"]).optional(),
      }),
    )
    .optional(),
  table: z.string(),
  where: expressionSchema.optional(),
});

export type TSubsetRequest = z.infer<typeof subsetRequestSchema>;

export function toPlainExpression(expression: IR.BasicExpression): TPlainExpression {
  if (expression.type === "func") {
    return { args: expression.args.map(toPlainExpression), name: expression.name, type: "func" };
  }
  if (expression.type === "ref") return { path: [...expression.path], type: "ref" };
  if (expression.value instanceof Date) return { type: "date", value: expression.value.toISOString() };
  return { type: "val", value: expression.value };
}

export function toSubsetRequest(
  table: string,
  { where, orderBy, limit, offset, cursor }: LoadSubsetOptions,
): TSubsetRequest {
  return {
    cursor:
      cursor === undefined
        ? undefined
        : { whereCurrent: toPlainExpression(cursor.whereCurrent), whereFrom: toPlainExpression(cursor.whereFrom) },
    limit,
    offset,
    orderBy: orderBy?.map(({ expression, compareOptions }) => ({
      direction: compareOptions.direction,
      expression: toPlainExpression(expression),
      nulls: compareOptions.nulls,
    })),
    table,
    where: where === undefined ? undefined : toPlainExpression(where),
  };
}

// The rows of a collection's loadSubset from Postgres, or null when the collection must wait for PowerSync instead
export const loadTableSubsetFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => subsetRequestSchema.parse(data))
  .handler(async ({ data }) => {
    const { loadTableSubset } = await import("@/db/functions/table-subset");
    return loadTableSubset(data, isAdminSession(getCookie(ADMIN_SESSION_COOKIE_NAME)));
  });
