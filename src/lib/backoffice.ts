import { max } from "date-fns";

import { dbTableDeliveryNoteLine, dbTableSellOrderLine } from "@/db/schema";
import { eachAppMonth, endOfAppDay, formatAppDate, startOfAppDay, startOfAppMonth } from "@/lib/dates";
import { AUDIT_ADMIN_LABEL, AUDIT_NOT_ADMIN_LABEL, getAuditUserNameLabel } from "@/messages/backoffice";
import { DELIVERY_NOTE_LABEL } from "@/messages/delivery-note";
import { INVOICE_LABEL } from "@/messages/invoice";
import { PRODUCTION_ORDER_LABEL } from "@/messages/production-order";
import { SELL_ORDER_LABEL } from "@/messages/sell-order";
import type { DateRangeFilter } from "@/schemas";

export const BACKOFFICE_MAX_LINES = 500;
export const AUDIT_LOG_PAGE_SIZE = 20;
// The first entry the database can hold: the app started writing the audit log in November 2026. Each month is a bucket
// of PowerSync, which allows 1000 per connection, so an old start date only subscribes to months that can have entries
const AUDIT_LOG_FIRST_MONTH_START = new Date("2026-11-01T00:00:00+01:00");

// The month column of the audit log, yyyyMM in the app time zone
export const getAuditLogMonth = (date: Date) => Number(formatAppDate(date, "yyyyMM"));

/**
 * The entries the date filter of the Backoffice shows, and the months it syncs for them. Without a start date, from the
 * start of the month of the end date. Without an end date there is no upper bound, so new entries show as they come.
 *
 * shortcut: a Backoffice left open into a new month does not show its entries until it is reloaded, upgrade if that
 * happens in practice
 */
export function getAuditLogRange(filter?: DateRangeFilter | null) {
  const end = filter?.endDate != null ? endOfAppDay(filter.endDate) : undefined;
  const lastDay = end ?? new Date();
  const start = filter?.startDate != null ? startOfAppDay(filter.startDate) : startOfAppMonth(lastDay);
  const months = eachAppMonth(max([start, AUDIT_LOG_FIRST_MONTH_START]), lastDay).map(getAuditLogMonth);
  return { end, months, start };
}

const AUDIT_DOCUMENT_LABELS = {
  deliveryNote: DELIVERY_NOTE_LABEL,
  invoice: INVOICE_LABEL,
  productionOrder: PRODUCTION_ORDER_LABEL,
  sellOrder: SELL_ORDER_LABEL,
};
export type TAuditDocumentRouter = keyof typeof AUDIT_DOCUMENT_LABELS;

interface TAuditRouterDocument {
  documentRouter: TAuditDocumentRouter;
  // A failed change of a line only sends the id of the line, so its document is read from its row
  lineTable?: typeof dbTableDeliveryNoteLine | typeof dbTableSellOrderLine;
}

// The routers whose mutations change a document, its own and the ones of its lines
const AUDIT_ROUTER_DOCUMENTS: Record<string, TAuditRouterDocument | undefined> = {
  deliveryNote: { documentRouter: "deliveryNote" },
  deliveryNoteLine: { documentRouter: "deliveryNote", lineTable: dbTableDeliveryNoteLine },
  invoice: { documentRouter: "invoice" },
  productionOrder: { documentRouter: "productionOrder" },
  sellOrder: { documentRouter: "sellOrder" },
  sellOrderLine: { documentRouter: "sellOrder", lineTable: dbTableSellOrderLine },
};

export const getAuditRouterDocument = (path: string) => AUDIT_ROUTER_DOCUMENTS[path.split(".")[0]];

export function getAuditDocumentLabel(path: string, documentId: string | null) {
  const routerDocument = getAuditRouterDocument(path);
  return routerDocument === undefined || documentId === null
    ? ""
    : `${AUDIT_DOCUMENT_LABELS[routerDocument.documentRouter]} ${documentId}`;
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
