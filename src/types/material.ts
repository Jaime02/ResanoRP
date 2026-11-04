import type { InferSelectModel } from "drizzle-orm";

import type { dbTableMaterial } from "@/db/schema";
import type { SerializeDateFields } from "@/types";

export type BaseMaterial = InferSelectModel<typeof dbTableMaterial>;
export type BaseMaterialSerialized = SerializeDateFields<BaseMaterial>;

export const COMPATIBLE_MATERIALS_PAGE_SIZE = 3;
