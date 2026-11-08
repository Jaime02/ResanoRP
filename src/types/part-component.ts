import type { InferSelectModel } from "drizzle-orm";

import type { dbTablePartComponent } from "@/db/schema";

export type BasePartComponent = InferSelectModel<typeof dbTablePartComponent>;
