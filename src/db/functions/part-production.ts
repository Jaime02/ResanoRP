import type { TDatabase } from "@/db";
import db from "@/db";

export function getPartProductionsOfMachineAndPart(
  { machineId, partId }: { machineId: number; partId: number },
  dbConnection: TDatabase = db,
) {
  return dbConnection.query.dbTablePartProduction.findMany({
    where: { machineId, productionOrder: { partId } },
    orderBy: { date: "desc" },
  });
}
