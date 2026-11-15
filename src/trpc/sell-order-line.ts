import { TRPCError } from "@trpc/server";
import { and, eq, isNotNull } from "drizzle-orm";

import { resetSellOrderLineInvoices } from "@/db/functions/invoice";
import { removeProductionOrdersFromMachines } from "@/db/functions/machine-production-order-queue";
import { dbTableProductionOrder, dbTableSellOrderLine } from "@/db/schema";
import { handleMutationError } from "@/lib/handlers";
import { requiredIdObjectSchema } from "@/schemas";
import { createSellOrderLineSchema, updateSellOrderLineSchema } from "@/schemas/sell-order-line";
import { adminProcedure, router } from "@/trpc";

export default router({
  create: adminProcedure.input(createSellOrderLineSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const newSellOrderLine = (
          await tx
            .insert(dbTableSellOrderLine)
            .values({
              ...input,
              pendingQuantity: input.quantity,
            })
            .returning()
        ).at(0);
        if (!newSellOrderLine) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Error al crear la línea del Pedido de venta",
          });
        }

        return { item: newSellOrderLine };
      } catch (error) {
        handleMutationError({ error });
      }
    }),
  ),
  update: adminProcedure.input(updateSellOrderLineSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const previousSellOrderLine = await tx.query.dbTableSellOrderLine.findFirst({ where: { id: input.id } });
        const updatedSellOrderLine = (
          await tx.update(dbTableSellOrderLine).set(input).where(eq(dbTableSellOrderLine.id, input.id)).returning()
        ).at(0);
        if (!previousSellOrderLine || !updatedSellOrderLine) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Línea del Pedido de venta con ID ${input.id} no encontrada`,
          });
        }
        // Compared as numbers, as the same price can be typed with more trailing zeros
        const toNumber = (price: string | null) => (price === null ? null : Number(price));
        if (toNumber(previousSellOrderLine.partPrice) !== toNumber(updatedSellOrderLine.partPrice)) {
          await resetSellOrderLineInvoices(input.id, tx);
        }
        return { item: updatedSellOrderLine };
      } catch (error) {
        handleMutationError({ error });
      }
    }),
  ),
  restore: adminProcedure.input(requiredIdObjectSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const restoredSellOrderLine = (
          await tx
            .update(dbTableSellOrderLine)
            .set({ deletedAt: null })
            .where(and(eq(dbTableSellOrderLine.id, input.id), isNotNull(dbTableSellOrderLine.deletedAt)))
            .returning()
        ).at(0);
        if (!restoredSellOrderLine) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Línea del Pedido de venta con ID ${input.id} no encontrada o no eliminada`,
          });
        }
        return { item: restoredSellOrderLine };
      } catch (error) {
        handleMutationError({ error });
      }
    }),
  ),
  delete: adminProcedure.input(requiredIdObjectSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const deletedSellOrderLine = (
          await tx
            .update(dbTableSellOrderLine)
            .set({ deletedAt: new Date() })
            .where(eq(dbTableSellOrderLine.id, input.id))
            .returning()
        ).at(0);
        if (!deletedSellOrderLine) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Línea del Pedido de venta con ID ${input.id} no encontrada`,
          });
        }
        const productionOrders = await tx
          .select({ id: dbTableProductionOrder.id })
          .from(dbTableProductionOrder)
          .where(eq(dbTableProductionOrder.sellOrderLineId, input.id));
        await removeProductionOrdersFromMachines(
          productionOrders.map((productionOrder) => productionOrder.id),
          tx,
        );
        return { item: deletedSellOrderLine };
      } catch (error) {
        handleMutationError({ error });
      }
    }),
  ),
});
