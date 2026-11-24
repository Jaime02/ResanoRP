import { useNavigate, useSearch } from "@tanstack/react-router";

import DialogClearLog from "@/components/backoffice/clear-log";
import TableUser from "@/components/backoffice/table-user";
import TableAuditLog from "@/components/table/audit-log";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BACKOFFICE_MAX_LINES, parseLogLine } from "@/lib/backoffice";
import {
  AUDIT_LOG_LABEL,
  AUDIT_LOG_MONTHS_NOTE,
  ERRORS_LOG_LABEL,
  USERS_LABEL,
  getLogLinesNote,
} from "@/messages/backoffice";
import { NO_DATA_MESSAGE } from "@/messages/common";

interface BackofficeProps {
  errors: Array<string>;
}

function ErrorsLog({ lines }: { lines: Array<string> }) {
  if (lines.length === 0) return <p>{NO_DATA_MESSAGE}</p>;
  return (
    <>
      <DialogClearLog />
      <ul data-testid="list-errors-log" className="flex flex-col gap-2">
        {lines.map((line, index) => {
          const { timestamp, level, message, ...meta } = parseLogLine(line);
          return (
            <li key={index} className="border-t border-border pt-1">
              <div>
                {String(timestamp)} [{String(level)}] {String(message)}
              </div>
              {Object.keys(meta).length > 0 && (
                <pre className="font-mono text-sm break-all whitespace-pre-wrap">{JSON.stringify(meta, null, 2)}</pre>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

const DEFAULT_TAB = "audit";

export default function Backoffice({ errors }: BackofficeProps) {
  const navigate = useNavigate();
  const {
    tab,
    createUser,
    editUserId,
    "table-audit-log": tableAuditLogState,
    "table-user": tableUserState,
  } = useSearch({ from: "/backoffice" });

  return (
    <Tabs
      value={tab ?? DEFAULT_TAB}
      onValueChange={(value: string) =>
        void navigate({
          replace: true,
          search: (prev) => ({ ...prev, tab: value !== DEFAULT_TAB ? value : undefined }),
          to: ".",
        })
      }
    >
      <TabsList className="self-center">
        <TabsTrigger value="audit">{AUDIT_LOG_LABEL}</TabsTrigger>
        <TabsTrigger value="errors">{ERRORS_LOG_LABEL}</TabsTrigger>
        <TabsTrigger value="users">{USERS_LABEL}</TabsTrigger>
      </TabsList>
      <TabsContent value="audit" className="mx-0">
        <p className="text-muted-foreground">{AUDIT_LOG_MONTHS_NOTE}</p>
        <TableAuditLog state={tableAuditLogState} />
      </TabsContent>
      <TabsContent value="errors" className="mx-0">
        <p className="text-muted-foreground">{getLogLinesNote(BACKOFFICE_MAX_LINES)}</p>
        <ErrorsLog lines={errors} />
      </TabsContent>
      <TabsContent value="users" className="mx-0">
        <TableUser createUser={createUser} editUserId={editUserId} state={tableUserState} />
      </TabsContent>
    </Tabs>
  );
}
