import type { InferSelectModel } from "drizzle-orm";

import type { dbTableMaterialLot, dbTableMaterialLotMovement } from "@/db/schema";

// Thin bars come in packages of too many bars to count, so a Lote counts packages or bars, chosen when it is received
export enum MaterialLotUnit {
  Package = "package",
  Bar = "bar",
}

export type BaseMaterialLot = InferSelectModel<typeof dbTableMaterialLot>;
export type BaseMaterialLotMovement = InferSelectModel<typeof dbTableMaterialLotMovement>;

export enum MaterialLotMovementMode {
  Take = "take",
  Return = "return",
}
