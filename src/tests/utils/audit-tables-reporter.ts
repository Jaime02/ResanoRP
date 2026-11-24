import type { Reporter, TestCase, TestResult } from "@playwright/test/reporter";

// Relative, as `playwright merge-reports` does not resolve the path aliases of the app
import { AUDIT_TABLES_ATTACHMENTS, findStaleAuditTables } from "./audit-tables";
import type { TTablesByProcedure } from "./audit-tables";

// Each CI shard runs a part of the tests, so what they all saw written is compared with what the mutations declare once
// their blob reports are merged. merge-reports only fails on a reporter that throws
export default class AuditTablesReporter implements Reporter {
  private declared: TTablesByProcedure | undefined;
  private readonly observed: Array<TTablesByProcedure> = [];

  onTestEnd(_test: TestCase, { attachments }: TestResult) {
    for (const { name, body } of attachments) {
      if (body === undefined) {
        continue;
      }
      const tables = JSON.parse(body.toString()) as TTablesByProcedure;
      if (name === AUDIT_TABLES_ATTACHMENTS.declared) {
        this.declared = tables;
      } else if (name === AUDIT_TABLES_ATTACHMENTS.observed) {
        this.observed.push(tables);
      }
    }
  }

  onEnd() {
    if (this.declared === undefined) {
      throw new Error(`No test attached ${AUDIT_TABLES_ATTACHMENTS.declared}, which the router test does`);
    }
    const stale = findStaleAuditTables(this.declared, this.observed);
    if (stale.length > 0) {
      throw new Error(`The tables of meta.writes that no test sees written:\n${stale.join("\n")}`);
    }
  }
}
