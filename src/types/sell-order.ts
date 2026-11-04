import type { InferSelectModel } from "drizzle-orm";

import type { dbTableSellOrder } from "@/db/schema";
import type { SerializeDateFields } from "@/types";

export type BaseSellOrder = InferSelectModel<typeof dbTableSellOrder>;
export type BaseSellOrderSerialized = SerializeDateFields<BaseSellOrder>;
