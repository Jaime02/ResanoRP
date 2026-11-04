import type { InferSelectModel } from "drizzle-orm";

import type { dbTableDeliveryNote } from "@/db/schema";
import type { SerializeDateFields } from "@/types";

export type BaseDeliveryNote = InferSelectModel<typeof dbTableDeliveryNote>;
export type BaseDeliveryNoteSerialized = SerializeDateFields<BaseDeliveryNote>;
