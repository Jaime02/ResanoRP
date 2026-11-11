import { TRPCError } from "@trpc/server";
import { and, eq, isNotNull } from "drizzle-orm";

import { PART_REFERENCE_CONSTRAINT, dbTablePartReference } from "@/db/schema";
import { handleMutationError } from "@/lib/handlers";
import { requiredIdObjectSchema } from "@/schemas";
import { createPartReferenceSchema, updatePartReferenceSchema } from "@/schemas/part-reference";
import { router } from "@/trpc";
import { adminProcedure } from "@/trpc";

const uniqueConstraints = [
  {
    constraintName: PART_REFERENCE_CONSTRAINT,
    errorMessage: "El Cliente ya tiene una Referencia con ese nombre",
  },
];

export default router({
  create: adminProcedure.input(createPartReferenceSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const newPartReference = (await tx.insert(dbTablePartReference).values(input).returning()).at(0);
        if (!newPartReference) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Error al crear la Referencia del Artículo",
          });
        }
        return { item: newPartReference };
      } catch (error) {
        handleMutationError({ error, uniqueConstraints });
      }
    }),
  ),
  update: adminProcedure.input(updatePartReferenceSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const updatedPartReference = (
          await tx.update(dbTablePartReference).set(input).where(eq(dbTablePartReference.id, input.id)).returning()
        ).at(0);
        if (!updatedPartReference) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Referencia del Artículo con ID ${input.id} no encontrada`,
          });
        }
        return { item: updatedPartReference };
      } catch (error) {
        handleMutationError({ error, uniqueConstraints });
      }
    }),
  ),
  delete: adminProcedure.input(requiredIdObjectSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const deletedPartReference = (
          await tx
            .update(dbTablePartReference)
            .set({ deletedAt: new Date() })
            .where(eq(dbTablePartReference.id, input.id))
            .returning()
        ).at(0);
        if (!deletedPartReference) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Referencia del Artículo con ID ${input.id} no encontrada`,
          });
        }
        return { item: deletedPartReference };
      } catch (error) {
        handleMutationError({ error });
      }
    }),
  ),
  restore: adminProcedure.input(requiredIdObjectSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const restoredPartReference = (
          await tx
            .update(dbTablePartReference)
            .set({ deletedAt: null })
            .where(and(eq(dbTablePartReference.id, input.id), isNotNull(dbTablePartReference.deletedAt)))
            .returning()
        ).at(0);
        if (!restoredPartReference) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Referencia del Artículo con ID ${input.id} no encontrada o no eliminada`,
          });
        }
        return { item: restoredPartReference };
      } catch (error) {
        handleMutationError({ error, uniqueConstraints });
      }
    }),
  ),
});
