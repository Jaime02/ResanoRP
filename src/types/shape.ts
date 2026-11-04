import type { InferSelectModel } from "drizzle-orm";

import type { dbTableShape } from "@/db/schema";

export type BaseShape = InferSelectModel<typeof dbTableShape>;
