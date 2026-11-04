import type { InferSelectModel } from "drizzle-orm";

import type { dbTablePart } from "@/db/schema";
import type { SerializeDateFields } from "@/types";

export type BasePart = InferSelectModel<typeof dbTablePart>;
export type BasePartSerialized = SerializeDateFields<BasePart>;
