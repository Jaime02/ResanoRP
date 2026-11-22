import { findStaleAuditTables } from "@/tests/utils/audit-tables";

const observedPaths = process.argv.slice(2);
const stale = findStaleAuditTables(observedPaths.length > 0 ? observedPaths : undefined);

if (stale.length > 0) {
  console.error(`The tables of audit-tables.json that no test sees written:\n${stale.join("\n")}`);
  process.exit(1);
}
