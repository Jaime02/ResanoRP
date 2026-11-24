import { TRPCError } from "@trpc/server";
import { and, eq, isNotNull } from "drizzle-orm";

import { getSellOrderLineDeliveredQuantity } from "@/db/functions/delivery-note-line";
import { resetSellOrderLineInvoices } from "@/db/functions/invoice";
import { removeProductionOrdersFromMachines } from "@/db/functions/machine-production-order-queue";
import { getSellOrderLineForUpdate } from "@/db/functions/sell-order-line";
import {
  dbTableInvoice,
  dbTableMachine,
  dbTableMachineProductionOrderQueue,
  dbTableProductionOrder,
  dbTableSellOrderLine,
} from "@/db/schema";
import { handleMutationError } from "@/lib/handlers";
import { clampPendingQuantity } from "@/lib/sell-order-line";
import { requiredIdObjectSchema } from "@/schemas";
import { createSellOrderLineSchema, updateSellOrderLineSchema } from "@/schemas/sell-order-line";
import { adminProcedure, router } from "@/trpc";

export default router({
  create: adminProcedure
    .meta({ writes: [dbTableSellOrderLine] })
    .input(createSellOrderLineSchema)
    .mutation(async ({ ctx, input }) =>
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
  update: adminProcedure
    .meta({ writes: [dbTableInvoice, dbTableSellOrderLine] })
    .input(updateSellOrderLineSchema)
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        try {
          // Locked, so an Albarán sent at the same time changes the pending quantity before or after this edit
          const previousSellOrderLine = await getSellOrderLineForUpdate(input.id, tx);
          if (!previousSellOrderLine) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: `Línea del Pedido de venta con ID ${input.id} no encontrada`,
            });
          }
          // The pending quantity is not edited by hand: it moves with the quantity, so lowering it to what was delivered
          // completes the Línea. It is taken from the stored row, not the copy the page had
          const changes =
            input.quantity === undefined
              ? input
              : {
                  ...input,
                  pendingQuantity: clampPendingQuantity(
                    previousSellOrderLine.pendingQuantity + input.quantity - previousSellOrderLine.quantity,
                    input.quantity,
                    await getSellOrderLineDeliveredQuantity(input.id, tx),
                  ),
                };
          const [updatedSellOrderLine] = await tx
            .update(dbTableSellOrderLine)
            .set(changes)
            .where(eq(dbTableSellOrderLine.id, input.id))
            .returning();
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
  restore: adminProcedure
    .meta({ writes: [dbTableSellOrderLine] })
    .input(requiredIdObjectSchema)
    .mutation(async ({ ctx, input }) =>
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
  delete: adminProcedure
    .meta({ writes: [dbTableMachine, dbTableMachineProductionOrderQueue, dbTableSellOrderLine] })
    .input(requiredIdObjectSchema)
    .mutation(async ({ ctx, input }) =>
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
