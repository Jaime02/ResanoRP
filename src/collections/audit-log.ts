import { getTableName } from "drizzle-orm";

import { powerSyncCollection, powerSyncCollectionOptions } from "@/collections/base";
import { dbTableAuditLog } from "@/db/schema";
import { auditLogSchema } from "@/schemas/audit-log";

const AUDIT_LOG_TABLE = getTableName(dbTableAuditLog);

// Its stream in docker/powersync/sync-config.yaml only sends the months asked for, as yyyyMM
export function getAuditLogStream(months: Array<number>) {
  return { name: AUDIT_LOG_TABLE, parameters: { months } };
}

export default function getAuditLogCollection(months: Array<number>) {
  return powerSyncCollection(
    AUDIT_LOG_TABLE,
    (baseOptions) =>
      powerSyncCollectionOptions({
        ...baseOptions,
        schema: auditLogSchema,
        getKey: (item) => item.id,
        streams: [getAuditLogStream(months)],
      }),
    months.join(","),
  );
}
