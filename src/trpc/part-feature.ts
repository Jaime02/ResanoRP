import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

import { PART_FEATURE_CONSTRAINT, dbTablePartFeature } from "@/db/schema";
import { handleMutationError } from "@/lib/handlers";
import { PART_FEATURE_CHECKED_DELETE_ERROR_MESSAGE, PART_FEATURE_CHECKED_RANGE_ERROR_MESSAGE } from "@/messages/part";
import { requiredIdObjectSchema } from "@/schemas";
import {
  createPartFeatureSchema,
  isPartFeatureRangeValid,
  PART_FEATURE_RANGE_ERROR_MESSAGE,
  updatePartFeatureSchema,
} from "@/schemas/part-feature";
import { router } from "@/trpc";
import { adminProcedure } from "@/trpc";

const uniqueConstraints = [
  {
    constraintName: PART_FEATURE_CONSTRAINT,
    errorMessage: "El Artículo ya tiene una Característica con ese nombre",
  },
];

export default router({
  create: adminProcedure
    .meta({ writes: [dbTablePartFeature] })
    .input(createPartFeatureSchema)
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        try {
          const newPartFeature = (await tx.insert(dbTablePartFeature).values(input).returning()).at(0);
          if (!newPartFeature) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Error al crear la característica del Artículo",
            });
          }
          return { item: newPartFeature };
        } catch (error) {
          handleMutationError({ error, uniqueConstraints });
        }
      }),
    ),
  update: adminProcedure
    .meta({ writes: [dbTablePartFeature] })
    .input(updatePartFeatureSchema)
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        try {
          // Locked, as the range is checked on the stored row the edited cell is merged into
          const currentPartFeature = (
            await tx.select().from(dbTablePartFeature).where(eq(dbTablePartFeature.id, input.id)).for("update")
          ).at(0);
          if (currentPartFeature === undefined) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: `Característica del Artículo con ID ${input.id} no encontrada`,
            });
          }
          const editedPartFeature = { ...currentPartFeature, ...input };
          if (!isPartFeatureRangeValid(editedPartFeature)) {
            throw new TRPCError({ code: "BAD_REQUEST", message: PART_FEATURE_RANGE_ERROR_MESSAGE });
          }
          const rangeChanged = [
            [currentPartFeature.minValue, editedPartFeature.minValue],
            [currentPartFeature.maxValue, editedPartFeature.maxValue],
          ].some(([current, next]) =>
            current === null ? next !== null : next === null || Number(current) !== Number(next),
          );
          if (rangeChanged) {
            const qualityCheck = await tx.query.dbTableQualityCheck.findFirst({ where: { partFeatureId: input.id } });
            if (qualityCheck) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: PART_FEATURE_CHECKED_RANGE_ERROR_MESSAGE,
              });
            }
          }
          const [updatedPartFeature] = await tx
            .update(dbTablePartFeature)
            .set(input)
            .where(eq(dbTablePartFeature.id, input.id))
            .returning();
          return { item: updatedPartFeature };
        } catch (error) {
          handleMutationError({ error, uniqueConstraints });
        }
      }),
    ),
  delete: adminProcedure
    .meta({ writes: [dbTablePartFeature] })
    .input(requiredIdObjectSchema)
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        try {
          const qualityCheck = await tx.query.dbTableQualityCheck.findFirst({ where: { partFeatureId: input.id } });
          if (qualityCheck) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: PART_FEATURE_CHECKED_DELETE_ERROR_MESSAGE,
            });
          }
          const deletedPartFeature = (
            await tx.delete(dbTablePartFeature).where(eq(dbTablePartFeature.id, input.id)).returning()
          ).at(0);
          if (!deletedPartFeature) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: `Característica del Artículo con ID ${input.id} no encontrada`,
            });
          }
          return { item: deletedPartFeature };
        } catch (error) {
          handleMutationError({ error });
        }
      }),
    ),
});
