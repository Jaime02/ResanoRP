import { createSelectSchema } from "drizzle-orm/zod";
import type { z } from "zod";

import { dbTableDeliveryMethod } from "@/db/schema";
import { nameFiltersSchema, tableStateSchema } from "@/schemas";

export const deliveryMethodSchema = createSelectSchema(dbTableDeliveryMethod);

export const tableDeliveryMethodStateSchema = tableStateSchema({ filtersSchema: nameFiltersSchema });
export type TTableDeliveryMethodState = z.infer<typeof tableDeliveryMethodStateSchema>;
