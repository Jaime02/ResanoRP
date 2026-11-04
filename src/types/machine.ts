import type { InferSelectModel } from "drizzle-orm";

import type { dbTableMachine } from "@/db/schema";
import type { SerializeDateFields } from "@/types";

export type BaseMachine = InferSelectModel<typeof dbTableMachine>;
export type BaseMachineSerialized = SerializeDateFields<BaseMachine>;

export const MACHINE_PRODUCTION_HISTORY_PAGE_SIZE = 10;
