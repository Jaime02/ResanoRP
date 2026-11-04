import type { InferSelectModel } from "drizzle-orm";

import type { dbTableDeliveryNoteLine } from "@/db/schema";

export type BaseDeliveryNoteLine = InferSelectModel<typeof dbTableDeliveryNoteLine>;
