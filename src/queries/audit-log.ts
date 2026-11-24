import { eq, gte, ilike, lte, useLiveQuery } from "@tanstack/react-db";

import getAuditLogCollection from "@/collections/audit-log";
import userCollection from "@/collections/user";
import { getAuditDocumentLabel, getAuditLogRange, getAuditUserLabel } from "@/lib/backoffice";
import { includesIgnoringAccents } from "@/lib/utils";
import type { TAuditLogFilters } from "@/schemas/audit-log";
import { getFilterValue } from "@/schemas/utils";

export function useQueryAuditLog(filters?: TAuditLogFilters) {
  return useLiveQuery({
    queryKey: ["auditLog", filters],
    query: (q) => {
      const { start, end, months } = getAuditLogRange(getFilterValue(filters, "timestamp"));
      // The Usuario of the IP as it is now, not when the entry was written. The client also holds the months another
      // Backoffice table still syncs, which the start and end leave out
      let query = q
        .from({ auditLog: getAuditLogCollection(months) })
        .leftJoin({ user: userCollection }, ({ auditLog, user }) => eq(auditLog.ip, user.ip))
        .where(({ auditLog }) => gte(auditLog.timestamp, start));
      if (end !== undefined) {
        query = query.where(({ auditLog }) => lte(auditLog.timestamp, end));
      }
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
      const document = getFilterValue(filters, "document");
      if (document != null) {
        query = query.fn.where((row) =>
          includesIgnoringAccents(getAuditDocumentLabel(row.auditLog.path, row.auditLog.documentId), document),
        );
      }
      const ip = getFilterValue(filters, "ip");
      if (ip != null) {
        query = query.where(({ auditLog }) => ilike(auditLog.ip, `%${ip}%`));
      }
      // Newest first. The id orders the entries written in the same millisecond
      return query
        .orderBy(({ auditLog }) => auditLog.timestamp, "desc")
        .orderBy(({ auditLog }) => auditLog.id, "desc")
        .select(({ auditLog, user }) => ({ ...auditLog, userName: user.name }));
    },
  });
}
