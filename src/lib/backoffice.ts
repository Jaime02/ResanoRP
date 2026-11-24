import { max } from "date-fns";

import { eachAppMonth, endOfAppDay, formatAppDate, startOfAppDay } from "@/lib/dates";
import { AUDIT_ADMIN_LABEL, AUDIT_NOT_ADMIN_LABEL, getAuditUserNameLabel } from "@/messages/backoffice";

export const BACKOFFICE_MAX_LINES = 500;
export const AUDIT_LOG_PAGE_SIZE = 20;
// The first entry the database can hold: the oldest document the migration brings from Prisma. Each month is a bucket
// of PowerSync, which allows 1000 per connection, so an old start date only subscribes to months that can have entries
const AUDIT_LOG_FIRST_MONTH_START = new Date("2021-01-01T00:00:00+01:00");

// The month column of the audit log, yyyyMM in the app time zone
export const getAuditLogMonth = (date: Date) => Number(formatAppDate(date, "yyyyMM"));

/**
 * The months of the audit log the Backoffice syncs: the ones of the date filter. Without a start date, only the month
 * of the end date, or the current month.
 *
 * shortcut: a Backoffice left open into a new month does not show its entries until it is reloaded, upgrade if that
 * happens in practice
 */
export function getAuditLogMonths(startDate?: Date | null, endDate?: Date | null): Array<number> {
  const end = endOfAppDay(endDate ?? new Date());
  const start = startDate != null ? startOfAppDay(startDate) : end;
  return eachAppMonth(max([start, AUDIT_LOG_FIRST_MONTH_START]), end).map(getAuditLogMonth);
}

// The name of the Usuario of the IP, if it has one, and the user mode. A login has no user mode yet
export function getAuditUserLabel(isAdmin: boolean | null, userName: string | undefined) {
  const userModeLabel = isAdmin === null ? "" : isAdmin ? AUDIT_ADMIN_LABEL : AUDIT_NOT_ADMIN_LABEL;
  return userName === undefined ? userModeLabel : getAuditUserNameLabel(userName, userModeLabel);
}

// A line that is not JSON, for instance one cut by the size limit of the log, is shown as it is
export function parseLogLine(line: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(line);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : { message: line };
  } catch {
    return { message: line };
  }
}
