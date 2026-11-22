import fs from "node:fs";

import { AUDIT_TABLES_OBSERVED_PATH } from "@/tests/utils/audit-tables";

// Listing the tests starts the reporters but not this, so it cannot empty what a run is still recording
export default function globalSetup() {
  fs.rmSync(AUDIT_TABLES_OBSERVED_PATH, { force: true });
}
