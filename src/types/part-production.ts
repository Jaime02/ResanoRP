import type { InferSelectModel } from "drizzle-orm";

import type { dbTablePartProduction } from "@/db/schema";

export type BasePartProduction = InferSelectModel<typeof dbTablePartProduction>;

export const PART_PRODUCTION_HISTORY_PAGE_SIZE = 5;
