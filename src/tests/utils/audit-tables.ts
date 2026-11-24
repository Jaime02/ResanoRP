// The reporter imports this in a CI job with no database and no path aliases, so it imports nothing of the app

export const AUDIT_TABLES_ATTACHMENTS = { declared: "audit-tables-declared", observed: "audit-tables-observed" };

export type TTablesByProcedure = Record<string, Array<string>>;

// What a mutation declares it writes has to be what some test saw it write, or it is a table nobody checks
export function findStaleAuditTables(declared: TTablesByProcedure, observed: Array<TTablesByProcedure>) {
  const seen: Record<string, Set<string> | undefined> = {};
  for (const tablesByProcedure of observed) {
    for (const [procedure, tables] of Object.entries(tablesByProcedure)) {
      seen[procedure] = new Set([...(seen[procedure] ?? []), ...tables]);
    }
  }
  return Object.entries(declared).flatMap(([procedure, tables]) => {
    const seenTables = seen[procedure];
    if (seenTables === undefined) {
      return [`${procedure}: no test calls it successfully`];
    }
    const unseen = tables.filter((table) => !seenTables.has(table));
    return unseen.length > 0 ? [`${procedure}: no test sees it write ${unseen.join(", ")}`] : [];
  });
}
