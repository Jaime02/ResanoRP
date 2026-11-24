import { createSelectSchema } from "drizzle-orm/zod";
import { z } from "zod";

import { dbTableAuditLog } from "@/db/schema";
import { dateRangeFilterSchema, tableStateSchema } from "@/schemas";

export const auditLogSchema = createSelectSchema(dbTableAuditLog);
export type TAuditLog = z.infer<typeof auditLogSchema>;

const auditLogFiltersSchema = z.array(
  z.discriminatedUnion("id", [
    z.object({ id: z.literal("timestamp"), value: dateRangeFilterSchema.nullable() }),
    z.object({ id: z.literal("path"), value: z.string().nullable() }),
    z.object({ id: z.literal("ok"), value: z.boolean().nullable() }),
    z.object({ id: z.literal("user"), value: z.string().nullable() }),
    z.object({ id: z.literal("ip"), value: z.string().nullable() }),
    z.object({ id: z.literal("document"), value: z.string().nullable() }),
  ]),
);
export type TAuditLogFilters = z.infer<typeof auditLogFiltersSchema>;
export const tableAuditLogStateSchema = tableStateSchema({ filtersSchema: auditLogFiltersSchema });
export type TTableAuditLogState = z.infer<typeof tableAuditLogStateSchema>;
