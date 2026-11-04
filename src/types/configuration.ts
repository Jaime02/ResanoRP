import type { InferSelectModel } from "drizzle-orm";

import type { dbTableConfiguration } from "@/db/schema";

export type BaseConfiguration = InferSelectModel<typeof dbTableConfiguration>;
