import type { InferSelectModel } from "drizzle-orm";

import type { dbTablePartFeature } from "@/db/schema";

export type BasePartFeature = InferSelectModel<typeof dbTablePartFeature>;
