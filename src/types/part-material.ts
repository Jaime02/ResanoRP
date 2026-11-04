import type { InferSelectModel } from "drizzle-orm";

import type { dbTablePartMaterial } from "@/db/schema";

export type BasePartMaterial = InferSelectModel<typeof dbTablePartMaterial>;
