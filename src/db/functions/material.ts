import type { SQL } from "drizzle-orm";
import { and, asc, eq, getColumns, gte, isNull, notInArray, sql } from "drizzle-orm";
import type z from "zod";

import type { TDatabase } from "@/db";
import db from "@/db";
import { dbTableMaterial, dbTablePartMaterial } from "@/db/schema";
import type { compatibleMaterialsSchema } from "@/schemas/material";

export async function getCompatibleMaterials(
  input: z.infer<typeof compatibleMaterialsSchema>,
  dbConnection: TDatabase = db,
) {
  const baseQuery = dbConnection.select(getColumns(dbTableMaterial)).from(dbTableMaterial);
  const existingMaterialIds = dbConnection
    .select({ materialId: dbTablePartMaterial.materialId })
    .from(dbTablePartMaterial)
    .where(eq(dbTablePartMaterial.partId, input.partId));

  const whereConditions: Array<SQL> = [
    ...[input.shapeId != null ? eq(dbTableMaterial.shapeId, input.shapeId) : undefined],
    notInArray(dbTableMaterial.id, existingMaterialIds),
    isNull(dbTableMaterial.deletedAt),
  ].filter((v): v is SQL => !!v);

  if (input.width !== null) {
    whereConditions.push(gte(sql`CAST(${dbTableMaterial.width} AS REAL)`, parseFloat(input.width)));
  }

  if (input.rawMaterialId != null) {
    whereConditions.push(eq(dbTableMaterial.rawMaterialId, input.rawMaterialId));
  }

  if (whereConditions.length > 0) {
    baseQuery.where(and(...whereConditions));
  }

  return baseQuery.orderBy(asc(sql`CAST(${dbTableMaterial.width} AS REAL)`));
}
