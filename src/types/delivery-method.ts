import type { InferSelectModel } from "drizzle-orm";

import type { dbTableDeliveryMethod } from "@/db/schema";
import type { SerializeDateFields } from "@/types";

export type BaseDeliveryMethod = InferSelectModel<typeof dbTableDeliveryMethod>;
export type BaseDeliveryMethodSerialized = SerializeDateFields<BaseDeliveryMethod>;
