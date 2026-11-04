import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

import { dbTableConfiguration } from "@/db/schema";
import { handleMutationError } from "@/lib/handlers";
import { updateConfigurationSchema } from "@/schemas/configuration";
import { router, generateTxId } from "@/trpc";
import { adminProcedure } from "@/trpc";

export default router({
  update: adminProcedure.input(updateConfigurationSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const txid = await generateTxId(tx);
        const updatedConfiguration = (
          await tx.update(dbTableConfiguration).set(input).where(eq(dbTableConfiguration.id, input.id)).returning()
        ).at(0);
        if (!updatedConfiguration) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Configuración con ID ${input.id} no encontrada`,
          });
        }
        return { item: updatedConfiguration, txid };
      } catch (error) {
        handleMutationError({ error });
      }
    }),
  ),
});
