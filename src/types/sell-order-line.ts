import type { InferSelectModel } from "drizzle-orm";

import type { dbTableSellOrderLine } from "@/db/schema";
import type { SerializeDateFields } from "@/types";

export type BaseSellOrderLine = InferSelectModel<typeof dbTableSellOrderLine>;
export type BaseSellOrderLineSerialized = SerializeDateFields<BaseSellOrderLine>;
