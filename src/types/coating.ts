import type { InferSelectModel } from "drizzle-orm";

import type { dbTableCoating } from "@/db/schema";
import type { SerializeDateFields } from "@/types";

export type BaseCoating = InferSelectModel<typeof dbTableCoating>;
export type BaseCoatingSerialized = SerializeDateFields<BaseCoating>;
