import type { InferSelectModel } from "drizzle-orm";

import type { dbTablePaymentMethod } from "@/db/schema";
import type { SerializeDateFields } from "@/types";

export type BasePaymentMethod = InferSelectModel<typeof dbTablePaymentMethod>;
export type BasePaymentMethodSerialized = SerializeDateFields<BasePaymentMethod>;
