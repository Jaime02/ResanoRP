import { TRPCError } from "@trpc/server";

import { dbTablePartStock } from "@/db/schema";
import { handleMutationError } from "@/lib/handlers";
import { createPartStockSchema } from "@/schemas/part-stock";
import { router, generateTxId } from "@/trpc";
import { procedure } from "@/trpc";

export default router({
  create: procedure.input(createPartStockSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const txid = await generateTxId(tx);
        const newPartStock = (
          await tx
            .insert(dbTablePartStock)
            .values({ ...input, date: new Date() })
            .returning()
        ).at(0);
        if (!newPartStock) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Error al crear el registro de Inventario del Artículo",
          });
        }

        return { item: newPartStock, txid };
      } catch (error) {
        handleMutationError({ error });
      }
    }),
  ),
});
