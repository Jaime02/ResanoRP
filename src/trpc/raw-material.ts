import { TRPCError } from "@trpc/server";
import { and, eq, isNotNull } from "drizzle-orm";

import { RAW_MATERIAL_NAME_CONSTRAINT, dbTableRawMaterial } from "@/db/schema";
import { handleMutationError } from "@/lib/handlers";
import { requiredIdObjectSchema } from "@/schemas";
import { createRawMaterialSchema, updateRawMaterialSchema } from "@/schemas/raw-material";
import { router } from "@/trpc";
import { adminProcedure } from "@/trpc";

const uniqueConstraints = [
  {
    constraintName: RAW_MATERIAL_NAME_CONSTRAINT,
    errorMessage: "Existe una Materia Prima con el mismo nombre",
  },
];

export default router({
  create: adminProcedure.input(createRawMaterialSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const newRawMaterial = (await tx.insert(dbTableRawMaterial).values(input).returning()).at(0);
        if (!newRawMaterial) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Error al crear la Materia Prima",
          });
        }

        return { item: newRawMaterial };
      } catch (error) {
        handleMutationError({ error, uniqueConstraints });
      }
    }),
  ),
  update: adminProcedure.input(updateRawMaterialSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const updatedRawMaterial = (
          await tx.update(dbTableRawMaterial).set(input).where(eq(dbTableRawMaterial.id, input.id)).returning()
        ).at(0);
        if (!updatedRawMaterial) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Materia Prima con ID ${input.id} no encontrada`,
          });
        }
        return { item: updatedRawMaterial };
      } catch (error) {
        handleMutationError({ error, uniqueConstraints });
      }
    }),
  ),
  delete: adminProcedure.input(requiredIdObjectSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const deletedRawMaterial = (
          await tx
            .update(dbTableRawMaterial)
            .set({ deletedAt: new Date() })
            .where(eq(dbTableRawMaterial.id, input.id))
            .returning()
        ).at(0);
        if (!deletedRawMaterial) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Materia Prima con ID ${input.id} no encontrada`,
          });
        }
        return { item: deletedRawMaterial };
      } catch (error) {
        handleMutationError({ error });
      }
    }),
  ),
  restore: adminProcedure.input(requiredIdObjectSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const restoredRawMaterial = (
          await tx
            .update(dbTableRawMaterial)
            .set({ deletedAt: null })
            .where(and(eq(dbTableRawMaterial.id, input.id), isNotNull(dbTableRawMaterial.deletedAt)))
            .returning()
        ).at(0);
        if (!restoredRawMaterial) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Materia Prima con ID ${input.id} no encontrada o no eliminada`,
          });
        }
        return { item: restoredRawMaterial };
      } catch (error) {
        handleMutationError({ error, uniqueConstraints });
      }
    }),
  ),
});
