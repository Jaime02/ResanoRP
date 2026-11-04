import { TRPCError } from "@trpc/server";
import { and, eq, isNotNull } from "drizzle-orm";

import { COATING_NAME_CONSTRAINT, dbTableCoating, dbTablePart } from "@/db/schema";
import { handleMutationError } from "@/lib/handlers";
import { createModelWithNameSchema, requiredIdObjectSchema, updateModelWithNameSchema } from "@/schemas";
import { router, generateTxId } from "@/trpc";
import { adminProcedure } from "@/trpc";

const uniqueConstraints = [
  {
    constraintName: COATING_NAME_CONSTRAINT,
    errorMessage: "Existe un Tratamiento con el mismo nombre",
  },
];

export default router({
  create: adminProcedure.input(createModelWithNameSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const txid = await generateTxId(tx);
        const newCoating = (await tx.insert(dbTableCoating).values(input).returning()).at(0);
        if (!newCoating) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Error al crear el Tratamiento",
          });
        }
        return { item: newCoating, txid };
      } catch (error) {
        handleMutationError({ error, uniqueConstraints });
      }
    }),
  ),
  update: adminProcedure.input(updateModelWithNameSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const txid = await generateTxId(tx);
        const updatedCoating = (
          await tx.update(dbTableCoating).set(input).where(eq(dbTableCoating.id, input.id)).returning()
        ).at(0);
        if (!updatedCoating) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Tratamiento con ID ${input.id} no encontrado`,
          });
        }
        return { item: updatedCoating, txid };
      } catch (error) {
        handleMutationError({ error, uniqueConstraints });
      }
    }),
  ),
  delete: adminProcedure.input(requiredIdObjectSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const txid = await generateTxId(tx);
        const deletedCoating = (
          await tx
            .update(dbTableCoating)
            .set({ deletedAt: new Date() })
            .where(eq(dbTableCoating.id, input.id))
            .returning()
        ).at(0);
        if (!deletedCoating) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Tratamiento con ID ${input.id} no encontrado`,
          });
        }
        const updatedParts = await tx
          .update(dbTablePart)
          .set({ coatingId: null })
          .where(eq(dbTablePart.coatingId, input.id))
          .returning({ id: dbTablePart.id });
        return { item: deletedCoating, txid, updatedPartIds: updatedParts.map((part) => part.id) };
      } catch (error) {
        handleMutationError({ error });
      }
    }),
  ),
  restore: adminProcedure.input(requiredIdObjectSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const txid = await generateTxId(tx);
        const restoredCoating = (
          await tx
            .update(dbTableCoating)
            .set({ deletedAt: null })
            .where(and(eq(dbTableCoating.id, input.id), isNotNull(dbTableCoating.deletedAt)))
            .returning()
        ).at(0);
        if (!restoredCoating) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Tratamiento con ID ${input.id} no encontrado o no eliminado`,
          });
        }
        return { item: restoredCoating, txid };
      } catch (error) {
        handleMutationError({ error, uniqueConstraints });
      }
    }),
  ),
});
