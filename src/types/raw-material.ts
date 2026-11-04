import type { InferSelectModel } from "drizzle-orm";

import type { dbTableRawMaterial } from "@/db/schema";
import type { SerializeDateFields } from "@/types";

export type BaseRawMaterial = InferSelectModel<typeof dbTableRawMaterial>;
export type BaseRawMaterialSerialized = SerializeDateFields<BaseRawMaterial>;
