import type { InferSelectModel } from "drizzle-orm";

import type { dbTablePartPrice } from "@/db/schema";
import type { SerializeDateFields } from "@/types";

export type BasePartPrice = InferSelectModel<typeof dbTablePartPrice>;
export type BasePartPriceSerialized = SerializeDateFields<BasePartPrice>;
