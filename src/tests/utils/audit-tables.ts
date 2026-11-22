import fs from "node:fs";
import path from "node:path";

// Which tables each procedure writes, in some case or other. Run the tests with UPDATE_AUDIT_TABLES=true to add the
// ones they saw
export const AUDIT_TABLES_PATH = path.join(import.meta.dirname, "..", "audit-tables.json");

// One line for every test that passed, with the tables each procedure wrote in it. Playwright empties its folder
// before every run
export const AUDIT_TABLES_OBSERVED_PATH = path.join(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "test-results",
  "audit-tables-observed.jsonl",
);

export function readAuditTables(): Record<string, Array<string> | undefined> {
  return fs.existsSync(AUDIT_TABLES_PATH)
    ? (JSON.parse(fs.readFileSync(AUDIT_TABLES_PATH, "utf-8")) as Record<string, Array<string>>)
    : {};
}

export function recordObservedTables(observed: Record<string, Array<string>>) {
  fs.mkdirSync(path.dirname(AUDIT_TABLES_OBSERVED_PATH), { recursive: true });
  fs.appendFileSync(AUDIT_TABLES_OBSERVED_PATH, `${JSON.stringify(observed)}\n`);
}

// What the file says a procedure writes has to be what some test saw it write, or it is a table nobody checks
export function findStaleAuditTables(observedPaths: Array<string> = [AUDIT_TABLES_OBSERVED_PATH]) {
  const observed: Record<string, Set<string> | undefined> = {};
  for (const observedPath of observedPaths.filter((filePath) => fs.existsSync(filePath))) {
    for (const line of fs.readFileSync(observedPath, "utf-8").split("\n").filter(Boolean)) {
      for (const [procedure, tables] of Object.entries(JSON.parse(line) as Record<string, Array<string>>)) {
        observed[procedure] = new Set([...(observed[procedure] ?? []), ...tables]);
      }
    }
  }
  return Object.entries(readAuditTables()).flatMap(([procedure, tables = []]) => {
    const seen = observed[procedure];
    if (seen === undefined) {
      return [`${procedure}: no test calls it successfully`];
    }
    const unseen = tables.filter((table) => !seen.has(table));
    return unseen.length > 0 ? [`${procedure}: no test sees it write ${unseen.join(", ")}`] : [];
  });
}
