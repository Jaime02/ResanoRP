import type { InferSelectModel } from "drizzle-orm";

import type { dbTableQualityCheck } from "@/db/schema";

export type BaseQualityCheck = InferSelectModel<typeof dbTableQualityCheck>;
