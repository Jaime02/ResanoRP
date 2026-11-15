import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

import { dbTablePartPrice } from "@/db/schema";
import { handleMutationError } from "@/lib/handlers";
import { requiredIdObjectSchema } from "@/schemas";
import { createPartPriceSchema, updatePartPriceSchema } from "@/schemas/part-price";
import { router } from "@/trpc";
import { adminProcedure } from "@/trpc";

export default router({
  create: adminProcedure.input(createPartPriceSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const newPartPrice = (await tx.insert(dbTablePartPrice).values(input).returning()).at(0);
        if (!newPartPrice) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Error al crear el Precio",
          });
        }
        return { item: newPartPrice };
      } catch (error) {
        handleMutationError({ error });
      }
    }),
  ),
  update: adminProcedure.input(updatePartPriceSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const updatedPartPrice = (
          await tx.update(dbTablePartPrice).set(input).where(eq(dbTablePartPrice.id, input.id)).returning()
        ).at(0);
        if (!updatedPartPrice) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Precio con ID ${input.id} no encontrado`,
          });
        }
        return { item: updatedPartPrice };
      } catch (error) {
        handleMutationError({ error });
      }
    }),
  ),
  delete: adminProcedure.input(requiredIdObjectSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const deletedPrice = (
          await tx.delete(dbTablePartPrice).where(eq(dbTablePartPrice.id, input.id)).returning()
        ).at(0);
        if (!deletedPrice) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Precio con ID ${input.id} no encontrado`,
          });
        }
        return { item: deletedPrice };
      } catch (error) {
        handleMutationError({ error });
      }
    }),
  ),
});
