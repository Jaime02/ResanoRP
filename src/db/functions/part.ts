import { and, eq, isNull, sql } from "drizzle-orm";

import type { TDatabase } from "@/db";
import db from "@/db";
import { dbTablePart, dbTablePartComponent } from "@/db/schema";

export function getPartById(partId: number, dbConnection: TDatabase = db) {
  return dbConnection.query.dbTablePart.findFirst({ where: { id: partId } });
}

export function getPartFeaturesOfPart(partId: number, dbConnection: TDatabase = db) {
  return dbConnection.query.dbTablePartFeature.findMany({ where: { partId }, orderBy: { id: "asc" } });
}

export function getPartComponentsOfPart(parentPartId: number, dbConnection: TDatabase = db) {
  return dbConnection.select().from(dbTablePartComponent).where(eq(dbTablePartComponent.parentPartId, parentPartId));
}

// UNION instead of UNION ALL so the walk ends even if the table already holds a cycle
export async function isPartInComponentTree(
  { partId, rootPartId }: { partId: number; rootPartId: number },
  dbConnection: TDatabase = db,
) {
  const result = (await dbConnection.execute(sql`
    WITH RECURSIVE tree(id) AS (
      SELECT ${rootPartId}::integer
      UNION
      SELECT ${dbTablePartComponent.componentPartId} FROM ${dbTablePartComponent}
      JOIN tree ON ${dbTablePartComponent.parentPartId} = tree.id
    )
    SELECT 1 FROM tree WHERE id = ${partId} LIMIT 1
  `)) as { rows: Array<unknown> };
  return result.rows.length > 0;
}

export function getActivePartSetsUsingPart(partId: number, dbConnection: TDatabase = db) {
  return dbConnection
    .select({ description: dbTablePart.description })
    .from(dbTablePartComponent)
    .innerJoin(dbTablePart, eq(dbTablePart.id, dbTablePartComponent.parentPartId))
    .where(and(eq(dbTablePartComponent.componentPartId, partId), isNull(dbTablePart.deletedAt)))
    .orderBy(dbTablePart.description);
}
