import type { InferSelectModel } from "drizzle-orm";

import type { dbTableTreatmentReception, dbTableTreatmentShipment } from "@/db/schema";

export type BaseTreatmentShipment = InferSelectModel<typeof dbTableTreatmentShipment>;
export type BaseTreatmentReception = InferSelectModel<typeof dbTableTreatmentReception>;
