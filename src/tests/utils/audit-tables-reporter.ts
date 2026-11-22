import fs from "node:fs";
import path from "node:path";

import type { FullConfig, FullResult, Reporter, Suite } from "@playwright/test/reporter";

import { findStaleAuditTables } from "@/tests/utils/audit-tables";

// What the tests saw can only be compared with audit-tables.json when every test ran and passed. A sharded run is
// checked by `bun run check-audit-tables` on what all its shards saw
export default class AuditTablesReporter implements Reporter {
  private isFullRun = false;

  onBegin(config: FullConfig, suite: Suite) {
    const [{ testDir }] = config.projects;
    const ranFiles = new Set(suite.allTests().map(({ location }) => path.relative(testDir, location.file)));
    const testFiles = fs
      .readdirSync(testDir, { recursive: true, encoding: "utf-8" })
      .filter((file) => file.endsWith(".test.ts"))
      .map((file) => path.normalize(file));
    this.isFullRun =
      config.shard === null &&
      config.grepInvert === null &&
      [config.grep].flat().every(({ source }) => source === ".*") &&
      testFiles.every((file) => ranFiles.has(file));
  }

  async onEnd(result: FullResult) {
    if (!this.isFullRun || result.status !== "passed") {
      return undefined;
    }
    const stale = findStaleAuditTables();
    if (stale.length === 0) {
      return undefined;
    }
    console.error(`The tables of audit-tables.json that no test sees written:\n${stale.join("\n")}`);
    return { status: "failed" as const };
  }
}
