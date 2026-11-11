import { TRPCError } from "@trpc/server";
import { and, eq, isNotNull } from "drizzle-orm";

import { DELIVERY_METHOD_NAME_CONSTRAINT, dbTableClient, dbTableDeliveryMethod } from "@/db/schema";
import { handleMutationError } from "@/lib/handlers";
import { createModelWithNameSchema, requiredIdObjectSchema, updateModelWithNameSchema } from "@/schemas";
import { router } from "@/trpc";
import { adminProcedure } from "@/trpc";

const uniqueConstraints = [
  {
    constraintName: DELIVERY_METHOD_NAME_CONSTRAINT,
    errorMessage: "Existe un Transporte con el mismo nombre",
  },
];

export default router({
  create: adminProcedure.input(createModelWithNameSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const newDeliveryMethod = (await tx.insert(dbTableDeliveryMethod).values(input).returning()).at(0);
        if (!newDeliveryMethod) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Error al crear el Transporte",
          });
        }
        return { item: newDeliveryMethod };
      } catch (error) {
        handleMutationError({ error, uniqueConstraints });
      }
    }),
  ),
  update: adminProcedure.input(updateModelWithNameSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const updatedDeliveryMethod = (
          await tx.update(dbTableDeliveryMethod).set(input).where(eq(dbTableDeliveryMethod.id, input.id)).returning()
        ).at(0);
        if (!updatedDeliveryMethod) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Transporte con ID ${input.id} no encontrado`,
          });
        }
        return { item: updatedDeliveryMethod };
      } catch (error) {
        handleMutationError({ error, uniqueConstraints });
      }
    }),
  ),

  delete: adminProcedure.input(requiredIdObjectSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const deletedDeliveryMethod = (
          await tx
            .update(dbTableDeliveryMethod)
            .set({ deletedAt: new Date() })
            .where(eq(dbTableDeliveryMethod.id, input.id))
            .returning()
        ).at(0);
        if (!deletedDeliveryMethod) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Transporte con ID ${input.id} no encontrado`,
          });
        }
        await tx
          .update(dbTableClient)
          .set({ defaultDeliveryMethodId: null })
          .where(eq(dbTableClient.defaultDeliveryMethodId, input.id));
        return { item: deletedDeliveryMethod };
      } catch (error) {
        handleMutationError({ error });
      }
    }),
  ),
  restore: adminProcedure.input(requiredIdObjectSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const restoredDeliveryMethod = (
          await tx
            .update(dbTableDeliveryMethod)
            .set({ deletedAt: null })
            .where(and(eq(dbTableDeliveryMethod.id, input.id), isNotNull(dbTableDeliveryMethod.deletedAt)))
            .returning()
        ).at(0);
        if (!restoredDeliveryMethod) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Transporte con ID ${input.id} no encontrado o no eliminado`,
          });
        }
        return { item: restoredDeliveryMethod };
      } catch (error) {
        handleMutationError({ error, uniqueConstraints });
      }
    }),
  ),
});
