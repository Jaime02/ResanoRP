import { z } from "zod";

import { decimalSchema, requiredIdObjectSchema, requiredIdSchema, stringSchema, tableStateSchema } from "@/schemas";

export const featureValueSchema = decimalSchema(2)
  .nullable()
  .transform((value) => (value === "" ? null : value));

export const PART_FEATURE_RANGE_ERROR_MESSAGE = "El valor mínimo no puede ser mayor que el máximo";

export function isPartFeatureRangeValid({ minValue, maxValue }: { minValue: string | null; maxValue: string | null }) {
  return minValue === null || maxValue === null || Number(minValue) <= Number(maxValue);
}

export function isWithinPartFeatureRange(
  value: string,
  { minValue, maxValue }: { minValue: string | null; maxValue: string | null },
) {
  return (
    (minValue === null || Number(value) >= Number(minValue)) && (maxValue === null || Number(value) <= Number(maxValue))
  );
}

const basePartFeatureSchema = z.object({
  feature: stringSchema({ nullable: false }),
  maxValue: featureValueSchema,
  minValue: featureValueSchema,
  partId: requiredIdSchema,
});

const rangeRefinement = { error: PART_FEATURE_RANGE_ERROR_MESSAGE, path: ["maxValue"] };

export const partFeatureSchema = basePartFeatureSchema
  .extend(requiredIdObjectSchema.shape)
  .refine(isPartFeatureRangeValid, rangeRefinement);

export const createPartFeatureSchema = basePartFeatureSchema.refine(isPartFeatureRangeValid, rangeRefinement);
export type TCreatePartFeature = z.infer<typeof createPartFeatureSchema>;

// A cell edit only sends the field it changed, so the server checks the range on the stored row it merges the edit into.
// A Característica stays in its Artículo
export const updatePartFeatureSchema = basePartFeatureSchema
  .omit({ partId: true })
  .partial()
  .extend(requiredIdObjectSchema.shape);

const partFeatureFiltersSchema = z.array(
  z.discriminatedUnion("id", [
    z.object({ id: z.literal("feature"), value: z.string().nullable() }),
    z.object({ id: z.literal("partId"), value: z.number().nullable() }),
  ]),
);

const tablePartFeatureStateSchema = tableStateSchema({ filtersSchema: partFeatureFiltersSchema });
export type TTablePartFeatureState = z.infer<typeof tablePartFeatureStateSchema>;
