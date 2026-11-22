import { sql } from "drizzle-orm";

import type { TDatabase } from "@/db";
import { AUDIT_INPUT_SETTING, AUDIT_PROCEDURE_SETTING, WRITE_TRACE_SCHEMA } from "@/logging/audit";

export interface TTracedWrite {
  id: number;
  procedure: string | null;
  inputKey: string | null;
  table: string;
  operation: "INSERT" | "UPDATE" | "DELETE";
  oldRow: Record<string, unknown> | null;
  newRow: Record<string, unknown> | null;
}

// The tests and the app share the database, so the rows the app writes are told apart by the connection name. The
// config of Playwright gives the connections of the tests their own name
function getRunnerApplicationName() {
  const { PGAPPNAME } = process.env;
  if (PGAPPNAME === undefined) {
    throw new Error("Environment variable PGAPPNAME is not set, see playwright.config.ts");
  }
  return PGAPPNAME;
}

async function getDb() {
  return (await import("@/db")).default;
}

// Every committed write of every table goes to an unlogged table, which the publication of PowerSync does not include
// and which a rolled back transaction takes with it. The procedure that made it and the input it was called with are the
// settings its transaction got, which are empty for a write outside of a mutation
async function installWriteTrace(db: TDatabase) {
  await db.execute(
    sql.raw(`
      CREATE SCHEMA IF NOT EXISTS ${WRITE_TRACE_SCHEMA};
      CREATE UNLOGGED TABLE IF NOT EXISTS ${WRITE_TRACE_SCHEMA}.writes (
        id bigserial PRIMARY KEY,
        application_name text NOT NULL,
        table_name text NOT NULL,
        operation text NOT NULL,
        old_row jsonb,
        new_row jsonb
      );
      ALTER TABLE ${WRITE_TRACE_SCHEMA}.writes ADD COLUMN IF NOT EXISTS procedure text;
      ALTER TABLE ${WRITE_TRACE_SCHEMA}.writes ADD COLUMN IF NOT EXISTS input_key text;
      CREATE OR REPLACE FUNCTION ${WRITE_TRACE_SCHEMA}.record() RETURNS trigger AS $$
      BEGIN
        INSERT INTO ${WRITE_TRACE_SCHEMA}.writes (application_name, procedure, input_key, table_name, operation, old_row, new_row)
        VALUES (
          current_setting('application_name'),
          NULLIF(current_setting('${AUDIT_PROCEDURE_SETTING}', true), ''),
          NULLIF(current_setting('${AUDIT_INPUT_SETTING}', true), ''),
          TG_TABLE_NAME,
          TG_OP,
          CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END,
          CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END
        );
        RETURN NULL;
      END
      $$ LANGUAGE plpgsql;
      DO $$
      DECLARE traced_table text;
      BEGIN
        FOR traced_table IN SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public' LOOP
          EXECUTE format(
            'CREATE OR REPLACE TRIGGER write_trace AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION ${WRITE_TRACE_SCHEMA}.record()',
            traced_table
          );
        END LOOP;
      END
      $$;
    `),
  );
}

// Installing locks every table, so it only runs when a table has no trigger or the trace lacks a column: on the first
// test after the stack was reset, after a table was added, or after the trace changed
export async function resetWriteTrace() {
  const db = await getDb();
  const { rows }: { rows: Array<{ isMissing: boolean }> } = await db.execute(sql`
    SELECT (
      EXISTS (
        SELECT FROM pg_catalog.pg_tables traced_table
        WHERE traced_table.schemaname = 'public' AND NOT EXISTS (
          SELECT FROM pg_catalog.pg_trigger
          WHERE tgname = 'write_trace' AND tgrelid = format('public.%I', traced_table.tablename)::regclass
        )
      ) OR (
        SELECT count(*) FROM information_schema.columns
        WHERE table_schema = ${WRITE_TRACE_SCHEMA} AND table_name = 'writes' AND column_name IN ('procedure', 'input_key')
      ) < 2
    ) AS "isMissing"
  `);
  if (rows[0].isMissing) {
    await installWriteTrace(db);
  }
  await db.execute(sql`TRUNCATE ${sql.identifier(WRITE_TRACE_SCHEMA)}.writes RESTART IDENTITY`);
}

export async function readAppWrites(): Promise<Array<TTracedWrite>> {
  const db = await getDb();
  const { rows }: { rows: Array<Record<string, unknown>> } = await db.execute(sql`
    SELECT id::int AS id, procedure, input_key AS "inputKey", table_name AS "table", operation, old_row AS "oldRow",
      new_row AS "newRow"
    FROM ${sql.identifier(WRITE_TRACE_SCHEMA)}.writes
    WHERE application_name <> ${getRunnerApplicationName()}
    ORDER BY id
  `);
  return rows as unknown as Array<TTracedWrite>;
}
