import { and, eq, getColumns, isNull } from "drizzle-orm";

import type { TDatabase } from "@/db";
import db from "@/db";
import { dbTablePartReference } from "@/db/schema";
import type { BasePartReference } from "@/types/part-reference";

export async function getPartReferencesByPartId(
  partId: number,
  dbConnection: TDatabase = db,
): Promise<Array<BasePartReference>> {
  return dbConnection
    .select(getColumns(dbTablePartReference))
    .from(dbTablePartReference)
    .where(and(eq(dbTablePartReference.partId, partId), isNull(dbTablePartReference.deletedAt)));
}

export async function getPartReferenceById(
  partReferenceId: number,
  dbConnection: TDatabase = db,
): Promise<BasePartReference | undefined> {
  return dbConnection.query.dbTablePartReference.findFirst({ where: { id: partReferenceId } });
}
