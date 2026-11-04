import type { InferSelectModel } from "drizzle-orm";

import type { dbTableProductionOrder } from "@/db/schema";
import type { SerializeDateFields } from "@/types";

export type BaseProductionOrder = InferSelectModel<typeof dbTableProductionOrder>;
export type BaseProductionOrderSerialized = SerializeDateFields<BaseProductionOrder>;
