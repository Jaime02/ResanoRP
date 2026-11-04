import type { SQL } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PgColumn } from "drizzle-orm/pg-core";
import { Pool } from "pg";

import relations from "@/db/relations";

if (process.env.DATABASE_URL === undefined) {
  throw new Error("Environment variable DATABASE_URL is not set");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const db = drizzle({ client: pool, relations });

await db.execute(sql`CREATE EXTENSION IF NOT EXISTS unaccent;`);

export function searchInStringColumnIgnoreDiacritics(column: PgColumn, value: string): SQL {
  return sql`unaccent(${column}) ILIKE unaccent(${`%${value}%`})`;
}

export default db;

export type TDatabase = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function cleanDatabase(db: TDatabase) {
  const tables: { rows: Array<{ tablename: string }> } = await db.execute(
    sql`SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public';`,
  );

  if (tables.rows.length === 0) return;

  const sequences: { rows: Array<{ sequencename: string }> } = await db.execute(
    sql`SELECT sequencename FROM pg_catalog.pg_sequences WHERE schemaname = 'public';`,
  );

  const statements = [
    `SET session_replication_role = 'replica';`,
    ...tables.rows.map((t) => `DELETE FROM "${t.tablename}";`),
    ...sequences.rows.map((s) => `ALTER SEQUENCE "${s.sequencename}" RESTART;`),
    `SET session_replication_role = 'origin';`,
  ];

  await db.execute(sql.raw(statements.join(" ")));
}
