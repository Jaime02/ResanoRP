import type { InferSelectModel } from "drizzle-orm";

import type { dbTablePartPriceEstimator } from "@/db/schema";

export type BasePartPriceEstimator = InferSelectModel<typeof dbTablePartPriceEstimator>;
