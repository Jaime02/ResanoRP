import { z } from "zod";

import { quantitySchema, requiredIdSchema, stringSchema } from "@/schemas";

export const updateMachineProductionOrderSchema = z.object({
  notes: stringSchema({ nullable: true }),
  productionOrderId: requiredIdSchema,
});

export const stopMachineProductionOrderSchema = z.object({
  machineId: requiredIdSchema,
  producedQuantity: quantitySchema.nullable(),
});
export type TStopMachineProductionOrder = z.infer<typeof stopMachineProductionOrderSchema>;
