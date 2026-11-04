import type { InferSelectModel } from "drizzle-orm";

import type { dbTablePartReference } from "@/db/schema";
import type { SerializeDateFields } from "@/types";

export type BasePartReference = InferSelectModel<typeof dbTablePartReference>;
export type BasePartReferenceSerialized = SerializeDateFields<BasePartReference>;
