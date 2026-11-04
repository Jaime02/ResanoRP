import z from "zod";

import { decimalSchema, nullableIdSchema, positiveQuantitySchema, priceSchema, requiredIdSchema } from "@/schemas";

const requiredDecimalSchema = (decimals: number) =>
  decimalSchema(decimals).refine((value) => value !== "", "Campo obligatorio");

const percentageSchema = requiredDecimalSchema(2).refine((value) => Number(value) <= 99, {
  error: "El porcentaje no puede ser mayor que 99",
});

export const partPriceEstimatorSchema = z.object({
  coatingCost: priceSchema.nullable(),
  machinePricePerHour: positiveQuantitySchema,
  machineSetupTimeMinutes: positiveQuantitySchema,
  materialCost: priceSchema.nullable(),
  materialId: nullableIdSchema,
  partId: requiredIdSchema,
  partLength: requiredDecimalSchema(2),
  partsPerHour: positiveQuantitySchema,
  otherCost: priceSchema.nullable(),
  secondOperationCost: priceSchema.nullable(),
  transportPercentage: percentageSchema.nullable(),
  unexpectedPercentage: percentageSchema.nullable(),
  wastePercentage: percentageSchema,
});

export const updatePartPriceEstimatorSchema = partPriceEstimatorSchema;
export type TUpdatePartPriceEstimator = z.infer<typeof updatePartPriceEstimatorSchema>;

export const partPriceEstimationFormSchema = partPriceEstimatorSchema.extend({
  clientId: nullableIdSchema,
  partPriceId: nullableIdSchema,
  quantity: positiveQuantitySchema,
});
export type TPartPriceEstimationForm = z.infer<typeof partPriceEstimationFormSchema>;
