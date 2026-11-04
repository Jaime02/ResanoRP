import { createSelectSchema } from "drizzle-orm/zod";

import { dbTableShape } from "@/db/schema";

export const shapeSchema = createSelectSchema(dbTableShape);
