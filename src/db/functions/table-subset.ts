import { getTableColumns, getTableName, inArray, is, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import type { PgColumn } from "drizzle-orm/pg-core";

import db from "@/db";
import * as dbSchema from "@/db/schema";
import type { TPlainExpression, TSubsetRequest } from "@/lib/table-subset-fns";

// A join over many rows looks up the rows of the next table by their keys, and then the ones of the table after it, one
// request after another. Past this many keys that chain took longer than waiting for PowerSync, which brings them anyway
export const MAX_LOOKUP_KEYS = 100;
// shortcut: above the 13,022 Pedidos the sell order list counts in full on a first load; derive it from the data if a
// table that size grows past it or a page reads larger tables whole
export const MAX_SUBSET_ROWS = 20_000;

// The JavaScript type of each column the app compares as Postgres does. Numerics are strings in the app, so '1.5' and
// '1.50' differ there, and text sorts with localeCompare instead of the database's collation
const EQUALITY_TYPES: Partial<Record<string, string>> = { PgBoolean: "boolean", PgInteger: "number", PgText: "string" };
const ORDER_TYPES = new Set(["PgInteger", "PgTimestamp"]);
const ORDER_OPERATORS: Partial<Record<string, string>> = { gt: ">", gte: ">=", lt: "<", lte: "<=" };
const FLIPPED_OPERATORS: Partial<Record<string, string>> = { gt: "lt", gte: "lte", lt: "gt", lte: "gte" };

class UntranslatableError extends Error {}

const refuse = (reason: string): never => {
  throw new UntranslatableError(reason);
};

const isOrderedValue = (column: PgColumn, value: unknown) =>
  column.columnType === "PgInteger" ? typeof value === "number" : value instanceof Date;

// A Date has milliseconds, and Postgres keeps microseconds
const columnSql = (column: PgColumn) =>
  column.columnType === "PgTimestamp" ? sql`date_trunc('milliseconds', ${column})` : sql`${column}`;

/**
 * The rows of a TanStack DB loadSubset, or null when Postgres would not return exactly the rows the collection's own
 * filter keeps, or more than MAX_SUBSET_ROWS. An extra row is as wrong as a missing one, since a `not` turns one into
 * the other, so a filter is only translated where Postgres and TanStack DB compare the same values the same way
 */
export async function loadTableSubset(request: TSubsetRequest) {
  const dbTable = Object.values(dbSchema).find((value) => is(value, PgTable) && getTableName(value) === request.table);
  if (dbTable === undefined || !is(dbTable, PgTable)) throw new Error(`Unknown table ${request.table}`);
  const columns: Partial<Record<string, PgColumn>> = getTableColumns(dbTable);

  const columnOf = (expression: TPlainExpression) =>
    expression.type === "ref" && expression.path.length === 1 ? columns[expression.path[0]] : undefined;
  const operands = ([first, second]: Array<TPlainExpression>) => {
    const firstColumn = columnOf(first);
    const column = firstColumn ?? columnOf(second);
    const value = firstColumn === undefined ? first : second;
    if (column === undefined || value.type !== "val") return refuse("not a column and a value");
    return { column, reversed: firstColumn === undefined, value: value.value };
  };

  const compile = (expression: TPlainExpression): SQL => {
    if (expression.type !== "func") return refuse(`a bare ${expression.type}`);
    const { name, args } = expression;
    if (name === "and" || name === "or") {
      return sql`(${sql.join(args.map(compile), name === "and" ? sql` AND ` : sql` OR `)})`;
    }
    if (name === "not") return sql`(NOT ${compile(args[0])})`;
    if (name === "isNull") {
      const column = columnOf(args[0]) ?? refuse("isNull of an expression");
      return sql`(${column} IS NULL)`;
    }
    // A row of the database has no undefined column
    if (name === "isUndefined") return sql`FALSE`;
    if (name === "eq") {
      const { column, value } = operands(args);
      if (value === null || value === undefined) return sql`NULL`;
      if (typeof value !== EQUALITY_TYPES[column.columnType]) return refuse(`eq on ${column.columnType}`);
      return sql`(${column} = ${value})`;
    }
    if (name === "in") {
      const [value, list] = args;
      const column = columnOf(value);
      if (column === undefined || list.type !== "val" || !Array.isArray(list.value)) {
        return refuse("in without a column and a list");
      }
      const items: Array<unknown> = list.value.filter((item) => item !== null && item !== undefined);
      if (items.length > MAX_LOOKUP_KEYS) return refuse(`in with ${items.length} keys`);
      if (items.some((item) => typeof item !== EQUALITY_TYPES[column.columnType])) {
        return refuse(`in on ${column.columnType}`);
      }
      return items.length === 0 ? sql`FALSE` : inArray(column, items);
    }
    const operator = ORDER_OPERATORS[name];
    if (operator !== undefined) {
      const { column, reversed, value } = operands(args);
      if (value === null || value === undefined) return sql`NULL`;
      if (!ORDER_TYPES.has(column.columnType) || !isOrderedValue(column, value)) {
        return refuse(`${name} on ${column.columnType}`);
      }
      const sqlOperator = reversed ? ORDER_OPERATORS[FLIPPED_OPERATORS[name]!]! : operator;
      return sql`(${columnSql(column)} ${sql.raw(sqlOperator)} ${value})`;
    }
    return refuse(`function ${name}`);
  };

  try {
    const where = request.where === undefined ? undefined : compile(request.where);
    // With the unique id among its columns, Postgres puts the rows in the order TanStack DB does, ties included.
    // Otherwise every matching row is loaded, since a limit could keep other rows than the collection's
    const orderColumns = request.orderBy?.map(({ expression }) => columnOf(expression)) ?? [];
    const exactOrder =
      request.orderBy !== undefined &&
      columns.id !== undefined &&
      orderColumns.includes(columns.id) &&
      request.orderBy.every(
        ({ nulls }, index) => nulls !== undefined && ORDER_TYPES.has(orderColumns[index]?.columnType ?? ""),
      );

    const select = async (conditions: Array<SQL | undefined>, limited: boolean) => {
      const present = conditions.filter((condition) => condition !== undefined);
      let query = db.select().from(dbTable).$dynamic();
      if (present.length > 0) query = query.where(sql.join(present, sql` AND `));
      if (!limited || !exactOrder) return query.limit(MAX_SUBSET_ROWS + 1);
      return query
        .orderBy(
          ...request.orderBy!.map(
            ({ direction, nulls }, index) =>
              sql`${columnSql(orderColumns[index]!)} ${sql.raw(direction === "desc" ? "DESC" : "ASC")} ${sql.raw(nulls === "first" ? "NULLS FIRST" : "NULLS LAST")}`,
          ),
        )
        .offset(request.offset ?? 0)
        .limit(Math.min(request.limit ?? MAX_SUBSET_ROWS + 1, MAX_SUBSET_ROWS + 1));
    };

    const rows =
      request.cursor === undefined || !exactOrder
        ? await select([where], true)
        : (
            await Promise.all([
              select([where, compile(request.cursor.whereCurrent)], false),
              select([where, compile(request.cursor.whereFrom)], true),
            ])
          ).flat();
    return rows.length > MAX_SUBSET_ROWS ? null : rows;
  } catch (error) {
    if (error instanceof UntranslatableError) return null;
    throw error;
  }
}
