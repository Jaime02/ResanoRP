import { createSelectSchema } from "drizzle-orm/zod";
import type { z } from "zod";

import { dbTableCoating } from "@/db/schema";
import { nameFiltersSchema, tableStateSchema } from "@/schemas";

export const coatingSchema = createSelectSchema(dbTableCoating);

export const tableCoatingStateSchema = tableStateSchema({ filtersSchema: nameFiltersSchema });
export type TTableCoatingState = z.infer<typeof tableCoatingStateSchema>;
