import type { TDatabase } from "@/db";
import db from "@/db";
import type { BaseBlueprint } from "@/types/blueprint";

export async function getBlueprintById(id: number, dbConnection: TDatabase = db): Promise<BaseBlueprint | undefined> {
  return dbConnection.query.dbTableBlueprint.findFirst({ where: { id } });
}

export async function getBlueprintsByPartId(
  partId: number,
  dbConnection: TDatabase = db,
): Promise<Array<BaseBlueprint>> {
  return dbConnection.query.dbTableBlueprint.findMany({
    where: { partId },
  });
}
