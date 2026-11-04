import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

import { PART_FEATURE_CONSTRAINT, dbTablePartFeature } from "@/db/schema";
import { handleMutationError } from "@/lib/handlers";
import { requiredIdObjectSchema } from "@/schemas";
import { createPartFeatureSchema, updatePartFeatureSchema } from "@/schemas/part-feature";
import { router, generateTxId } from "@/trpc";
import { adminProcedure } from "@/trpc";

const uniqueConstraints = [
  {
    constraintName: PART_FEATURE_CONSTRAINT,
    errorMessage: "El Artículo ya tiene una Característica con ese nombre",
  },
];

export default router({
  create: adminProcedure.input(createPartFeatureSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const txid = await generateTxId(tx);
        const newPartFeature = (await tx.insert(dbTablePartFeature).values(input).returning()).at(0);
        if (!newPartFeature) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Error al crear la característica del Artículo",
          });
        }
        return { item: newPartFeature, txid };
      } catch (error) {
        handleMutationError({ error, uniqueConstraints });
      }
    }),
  ),
  update: adminProcedure.input(updatePartFeatureSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const txid = await generateTxId(tx);
        const currentPartFeature = await tx.query.dbTablePartFeature.findFirst({ where: { id: input.id } });
        const rangeChanged =
          currentPartFeature !== undefined &&
          [
            [currentPartFeature.minValue, input.minValue],
            [currentPartFeature.maxValue, input.maxValue],
          ].some(([current, next]) =>
            current === null ? next !== null : next === null || Number(current) !== Number(next),
          );
        if (rangeChanged) {
          const qualityCheck = await tx.query.dbTableQualityCheck.findFirst({ where: { partFeatureId: input.id } });
          if (qualityCheck) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "La Característica tiene Controles de calidad y no se puede cambiar su rango",
            });
          }
        }
        const updatedPartFeature = (
          await tx.update(dbTablePartFeature).set(input).where(eq(dbTablePartFeature.id, input.id)).returning()
        ).at(0);
        if (!updatedPartFeature) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Característica del Artículo con ID ${input.id} no encontrada`,
          });
        }
        return { item: updatedPartFeature, txid };
      } catch (error) {
        handleMutationError({ error, uniqueConstraints });
      }
    }),
  ),
  delete: adminProcedure.input(requiredIdObjectSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const txid = await generateTxId(tx);
        const qualityCheck = await tx.query.dbTableQualityCheck.findFirst({ where: { partFeatureId: input.id } });
        if (qualityCheck) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "La Característica tiene Controles de calidad y no se puede eliminar",
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
        return { item: deletedPartFeature, txid };
      } catch (error) {
        handleMutationError({ error });
      }
    }),
  ),
});
