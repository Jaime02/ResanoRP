import type { InferSelectModel } from "drizzle-orm";

import type { dbTablePartStock } from "@/db/schema";
import type { SerializeDateFields } from "@/types";

export type BasePartStock = InferSelectModel<typeof dbTablePartStock>;
export type BasePartStockSerialized = SerializeDateFields<BasePartStock>;
