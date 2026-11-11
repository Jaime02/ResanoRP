import { TRPCError } from "@trpc/server";
import { and, eq, isNotNull } from "drizzle-orm";

import { PAYMENT_METHOD_NAME_CONSTRAINT, dbTableClient, dbTablePaymentMethod } from "@/db/schema";
import { handleMutationError } from "@/lib/handlers";
import { requiredIdObjectSchema } from "@/schemas";
import { createPaymentMethodSchema, updatePaymentMethodSchema } from "@/schemas/payment-method";
import { router } from "@/trpc";
import { adminProcedure } from "@/trpc";

const uniqueConstraints = [
  {
    constraintName: PAYMENT_METHOD_NAME_CONSTRAINT,
    errorMessage: "Existe una Forma de pago con el mismo nombre",
  },
];

export default router({
  create: adminProcedure.input(createPaymentMethodSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const newPaymentMethod = (await tx.insert(dbTablePaymentMethod).values(input).returning()).at(0);
        if (!newPaymentMethod) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Error al crear la Forma de pago",
          });
        }
        return { item: newPaymentMethod };
      } catch (error) {
        handleMutationError({ error, uniqueConstraints });
      }
    }),
  ),
  update: adminProcedure.input(updatePaymentMethodSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const updatedPaymentMethod = (
          await tx.update(dbTablePaymentMethod).set(input).where(eq(dbTablePaymentMethod.id, input.id)).returning()
        ).at(0);
        if (!updatedPaymentMethod) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Forma de pago con ID ${input.id} no encontrada`,
          });
        }
        return { item: updatedPaymentMethod };
      } catch (error) {
        handleMutationError({ error, uniqueConstraints });
      }
    }),
  ),
  delete: adminProcedure.input(requiredIdObjectSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const deletedPaymentMethod = (
          await tx
            .update(dbTablePaymentMethod)
            .set({ deletedAt: new Date() })
            .where(eq(dbTablePaymentMethod.id, input.id))
            .returning()
        ).at(0);
        if (!deletedPaymentMethod) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Forma de pago con ID ${input.id} no encontrada`,
          });
        }
        await tx
          .update(dbTableClient)
          .set({ defaultPaymentMethodId: null })
          .where(eq(dbTableClient.defaultPaymentMethodId, input.id));
        return { item: deletedPaymentMethod };
      } catch (error) {
        handleMutationError({ error });
      }
    }),
  ),
  restore: adminProcedure.input(requiredIdObjectSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const restoredPaymentMethod = (
          await tx
            .update(dbTablePaymentMethod)
            .set({ deletedAt: null })
            .where(and(eq(dbTablePaymentMethod.id, input.id), isNotNull(dbTablePaymentMethod.deletedAt)))
            .returning()
        ).at(0);
        if (!restoredPaymentMethod) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Forma de pago con ID ${input.id} no encontrada o no eliminada`,
          });
        }
        return { item: restoredPaymentMethod };
      } catch (error) {
        handleMutationError({ error, uniqueConstraints });
      }
    }),
  ),
});
