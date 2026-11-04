import { createSelectSchema } from "drizzle-orm/zod";
import { z } from "zod";

import { dbTableMachineProductionOrderQueue } from "@/db/schema";
import { requiredIdSchema } from "@/schemas";

export const machineProductionOrderSchema = createSelectSchema(dbTableMachineProductionOrderQueue);

export const addProductionOrderToMachineQueueSchema = z.object({
  machineId: requiredIdSchema,
  productionOrderId: requiredIdSchema,
});

export const moveProductionOrderToMachineQueueStartSchema = z.object({
  machineId: requiredIdSchema,
  productionOrderId: requiredIdSchema,
});

export const removeProductionOrderFromMachineQueueSchema = z.object({
  machineId: requiredIdSchema,
  productionOrderId: requiredIdSchema,
});
