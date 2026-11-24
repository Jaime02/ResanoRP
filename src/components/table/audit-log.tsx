import { useMemo } from "react";

import type { PublicBaseTableProps } from "@/components/table/base-table";
import BaseTable from "@/components/table/base-table";
import { DEFAULT_DATETIME_COLUMN_SIZE, createTableColumnHelper } from "@/components/table/column-helper";
import { AUDIT_LOG_PAGE_SIZE, getAuditUserLabel } from "@/lib/backoffice";
import { DateFormat, formatDate } from "@/lib/formatters";
import {
  AUDIT_ACTION_LABEL,
  AUDIT_DESCRIPTION_LABEL,
  AUDIT_INPUT_LABEL,
  IP_LABEL,
  AUDIT_OK_LABEL,
  AUDIT_RESULT_LABEL,
  AUDIT_USER_LABEL,
  LOG_TIMESTAMP_LABEL,
} from "@/messages/backoffice";
import { MUTATION_MESSAGES } from "@/messages/mutations";
import { useQueryAuditLog } from "@/queries/audit-log";
import type { TBaseModel } from "@/schemas";
import type { TAuditLog, TTableAuditLogState } from "@/schemas/audit-log";
import { CellDataType } from "@/types";

interface TAuditLogRow extends TBaseModel {
  timestamp: string;
  path: string;
  description: string;
  result: string;
  user: string;
  ip: string;
  input: string;
}

type TableAuditLogProps = Omit<PublicBaseTableProps<TAuditLogRow, TTableAuditLogState>, "onStateChange">;

const columnHelper = createTableColumnHelper<TAuditLogRow>();

function toRow({
  id,
  timestamp,
  path,
  ok,
  errorCode,
  isAdmin,
  ip,
  input,
  userName,
}: TAuditLog & { userName: string | undefined }): TAuditLogRow {
  return {
    description: MUTATION_MESSAGES[path] ?? "",
    id,
    input: input ?? "",
    ip: ip ?? "",
    path,
    result: ok ? AUDIT_OK_LABEL : String(errorCode),
    timestamp: formatDate(timestamp, DateFormat.DatetimeSeconds) ?? "",
    user: getAuditUserLabel(isAdmin, userName),
  };
}

const columns = [
  columnHelper.accessor("timestamp", {
    enableColumnFilter: true,
    header: LOG_TIMESTAMP_LABEL,
    id: "timestamp",
    meta: { dataType: CellDataType.Date, filterFieldName: "timestamp" },
    size: DEFAULT_DATETIME_COLUMN_SIZE,
  }),
  columnHelper.accessor("path", {
    enableColumnFilter: true,
    header: AUDIT_ACTION_LABEL,
    id: "path",
    meta: { dataType: CellDataType.String },
    size: 300,
  }),
  columnHelper.accessor("description", { header: AUDIT_DESCRIPTION_LABEL, id: "description", size: 300 }),
  // Checked is the OK, and the in between box the errors
  columnHelper.accessor("result", {
    enableColumnFilter: true,
    header: AUDIT_RESULT_LABEL,
    id: "result",
    meta: { dataType: CellDataType.Boolean, filterFieldName: "ok" },
    size: 120,
  }),
  columnHelper.accessor("user", {
    enableColumnFilter: true,
    header: AUDIT_USER_LABEL,
    id: "user",
    meta: { dataType: CellDataType.String },
    size: 220,
  }),
  columnHelper.accessor("ip", { header: IP_LABEL, id: "ip", size: 140 }),
  columnHelper.accessor("input", { header: AUDIT_INPUT_LABEL, id: "input", size: 400 }),
];

export default function TableAuditLog({ state, ...props }: TableAuditLogProps) {
  const { data: entries, isLoading } = useQueryAuditLog(state?.filters);
  const rows = useMemo(() => entries.map(toRow), [entries]);
  const pagination = state?.pagination === null ? null : { pageSize: AUDIT_LOG_PAGE_SIZE, ...state?.pagination };

  return (
    <BaseTable
      testId="table-audit-log"
      columns={columns}
      rows={rows}
      isLoading={isLoading}
      state={{ ...state, pagination }}
      {...props}
    />
  );
}
