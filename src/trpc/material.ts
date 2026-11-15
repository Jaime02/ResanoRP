import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";

import { getCompatibleMaterials } from "@/db/functions/material";
import { MATERIAL_COMBINATION_CONSTRAINT, dbTableMaterial } from "@/db/schema";
import { handleMutationError } from "@/lib/handlers";
import { requiredIdObjectSchema } from "@/schemas";
import { compatibleMaterialsSchema, createMaterialSchema } from "@/schemas/material";
import { router } from "@/trpc";
import { adminProcedure, procedure } from "@/trpc";

const uniqueConstraints = [
  {
    constraintName: MATERIAL_COMBINATION_CONSTRAINT,
    errorMessage: "Existe un Material con la misma Materia Prima, Forma y ancho",
  },
];

export default router({
  create: adminProcedure.input(createMaterialSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        // Restoring a deleted Material with the same combination avoids storing duplicates. The width is compared as a
        // number, so "10" also matches a Material stored as "10.0"
        const deletedMaterial = (
          await tx
            .select({ id: dbTableMaterial.id })
            .from(dbTableMaterial)
            .where(
              and(
                eq(dbTableMaterial.rawMaterialId, input.rawMaterialId),
                input.shapeId === null ? isNull(dbTableMaterial.shapeId) : eq(dbTableMaterial.shapeId, input.shapeId),
                eq(dbTableMaterial.width, input.width),
                isNotNull(dbTableMaterial.deletedAt),
              ),
            )
            .orderBy(desc(dbTableMaterial.deletedAt))
            .limit(1)
        ).at(0);
        if (deletedMaterial) {
          const restoredMaterial = (
            await tx
              .update(dbTableMaterial)
              .set({ deletedAt: null })
              .where(eq(dbTableMaterial.id, deletedMaterial.id))
              .returning()
          ).at(0);
          if (!restoredMaterial) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Error al restaurar el Material",
            });
          }
          return { item: restoredMaterial };
        }

        const newMaterial = (await tx.insert(dbTableMaterial).values(input).returning()).at(0);
        if (!newMaterial) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Error al crear el Material",
          });
        }

        return { item: newMaterial };
      } catch (error) {
        handleMutationError({ error, uniqueConstraints });
      }
    }),
  ),
  delete: adminProcedure.input(requiredIdObjectSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const deletedMaterial = (
          await tx
            .update(dbTableMaterial)
            .set({ deletedAt: new Date() })
            .where(eq(dbTableMaterial.id, input.id))
            .returning()
        ).at(0);
        if (!deletedMaterial) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Material con ID ${input.id} no encontrado`,
          });
        }
        return { item: deletedMaterial };
      } catch (error) {
        handleMutationError({ error });
      }
    }),
  ),
  restore: adminProcedure.input(requiredIdObjectSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const restoredMaterial = (
          await tx
            .update(dbTableMaterial)
            .set({ deletedAt: null })
            .where(and(eq(dbTableMaterial.id, input.id), isNotNull(dbTableMaterial.deletedAt)))
            .returning()
        ).at(0);
        if (!restoredMaterial) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Material con ID ${input.id} no encontrado o no eliminado`,
          });
        }
        return { item: restoredMaterial };
      } catch (error) {
        handleMutationError({ error, uniqueConstraints });
      }
    }),
  ),
  compatibleMaterials: procedure
    .input(compatibleMaterialsSchema)
    .query(async ({ ctx, input }) => getCompatibleMaterials(input, ctx.db)),
});
