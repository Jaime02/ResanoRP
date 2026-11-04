import type { InferSelectModel } from "drizzle-orm";

import type { dbTableBlueprint } from "@/db/schema";
import type { SerializeDateFields } from "@/types";

export type BaseBlueprint = InferSelectModel<typeof dbTableBlueprint>;
export type BaseBlueprintSerialized = SerializeDateFields<BaseBlueprint>;
