import { createSelectSchema } from "drizzle-orm/zod";
import { z } from "zod";

import { dbTableMachine } from "@/db/schema";
import { nameSchema, requiredIdObjectSchema, tableStateSchema } from "@/schemas";

export const machineSchema = createSelectSchema(dbTableMachine);

const diameterSchema = z.number().int().positive().nullable();

const baseMachineSchema = z.object({
  maxDiameter: diameterSchema,
  minDiameter: diameterSchema,
  name: nameSchema,
});

function isValidDiameterRange({
  minDiameter,
  maxDiameter,
}: {
  minDiameter: number | null;
  maxDiameter: number | null;
}) {
  return minDiameter === null || maxDiameter === null || minDiameter <= maxDiameter;
}
const invalidDiameterRangeError = {
  error: "El diámetro máximo no puede ser menor que el mínimo",
  path: ["maxDiameter"],
};

export const createMachineSchema = baseMachineSchema.refine(isValidDiameterRange, invalidDiameterRangeError);
export type TCreateMachine = z.infer<typeof createMachineSchema>;

export const updateMachineSchema = baseMachineSchema
  .extend(requiredIdObjectSchema.shape)
  .refine(isValidDiameterRange, invalidDiameterRangeError);
export type TUpdateMachine = z.infer<typeof updateMachineSchema>;

const machineFiltersSchema = z.array(
  z.discriminatedUnion("id", [
    z.object({ id: z.literal("activeProductionOrderId"), value: z.number().nullable() }),
    z.object({ id: z.literal("activeProductionOrderIds"), value: z.array(z.number()).nullable() }),
    z.object({ id: z.literal("compatiblePartWidth"), value: z.number().nullable() }),
    z.object({ id: z.literal("deletedAt"), value: z.boolean().nullable() }),
    z.object({ id: z.literal("excludeItemIds"), value: z.array(z.number()).nullable() }),
    z.object({ id: z.literal("name"), value: z.string().nullable() }),
  ]),
);
export type TMachineFilters = z.infer<typeof machineFiltersSchema>;

export const tableMachineStateSchema = tableStateSchema({ filtersSchema: machineFiltersSchema });
export type TTableMachineState = z.infer<typeof tableMachineStateSchema>;
