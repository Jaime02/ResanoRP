import { eq, gte, ilike, inArray, lte, useLiveQuery } from "@tanstack/react-db";

import getAuditLogCollection from "@/collections/audit-log";
import userCollection from "@/collections/user";
import { getAuditLogMonths, getAuditUserLabel } from "@/lib/backoffice";
import { endOfAppDay, startOfAppDay } from "@/lib/dates";
import { includesIgnoringAccents } from "@/lib/utils";
import type { TAuditLogFilters } from "@/schemas/audit-log";
import { getFilterValue } from "@/schemas/utils";

export function useQueryAuditLog(filters?: TAuditLogFilters) {
  return useLiveQuery({
    queryKey: ["auditLog", filters],
    query: (q) => {
      const timestamp = getFilterValue(filters, "timestamp");
      const months = getAuditLogMonths(timestamp?.startDate, timestamp?.endDate);
      // The Usuario of the IP as it is now, not when the entry was written. The client also holds the months another
      // Backoffice table still syncs, so the months are filtered too
      let query = q
        .from({ auditLog: getAuditLogCollection(months) })
        .leftJoin({ user: userCollection }, ({ auditLog, user }) => eq(auditLog.ip, user.ip))
        .where(({ auditLog }) => inArray(auditLog.month, months));
      const path = getFilterValue(filters, "path");
      if (path != null) {
        query = query.where(({ auditLog }) => ilike(auditLog.path, `%${path}%`));
      }
      const ok = getFilterValue(filters, "ok");
      if (ok != null) {
        query = query.where(({ auditLog }) => eq(auditLog.ok, ok));
      }
      const user = getFilterValue(filters, "user");
      if (user != null) {
        query = query.fn.where((row) =>
          includesIgnoringAccents(getAuditUserLabel(row.auditLog.isAdmin, row.user?.name), user),
        );
      }
      if (timestamp?.startDate != null) {
        const startDate = startOfAppDay(timestamp.startDate);
        query = query.where(({ auditLog }) => gte(auditLog.timestamp, startDate));
      }
      if (timestamp?.endDate != null) {
        const endDate = endOfAppDay(timestamp.endDate);
        query = query.where(({ auditLog }) => lte(auditLog.timestamp, endDate));
      }
      // Newest first. The id orders the entries written in the same millisecond
      return query
        .orderBy(({ auditLog }) => auditLog.timestamp, "desc")
        .orderBy(({ auditLog }) => auditLog.id, "desc")
        .select(({ auditLog, user }) => ({ ...auditLog, userName: user.name }));
    },
  });
}
