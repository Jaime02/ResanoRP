import type { InferSelectModel } from "drizzle-orm";

import type { dbTableMachineProductionOrderQueue } from "@/db/schema";

export type BaseMachineProductionOrderQueue = InferSelectModel<typeof dbTableMachineProductionOrderQueue>;
