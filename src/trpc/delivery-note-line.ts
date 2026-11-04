import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

import { getConfigurationVatPercentage } from "@/db/functions/configuration";
import {
  addSellOrderLinePendingQuantity,
  assertPendingQuantityWithinQuantity,
  deleteDeliveryNoteLine,
} from "@/db/functions/delivery-note-line";
import { resetChangedDeliveryNoteInvoice } from "@/db/functions/invoice";
import { getSellOrderLineById } from "@/db/functions/sell-order-line";
import { dbTableDeliveryNoteLine } from "@/db/schema";
import { handleMutationError } from "@/lib/handlers";
import { requiredIdObjectSchema } from "@/schemas";
import {
  createDeliveryNoteLineSchema,
  updateDeliveryNoteLinePriceSchema,
  updateDeliveryNoteLineSchema,
} from "@/schemas/delivery-note-line";
import { router, generateTxId } from "@/trpc";
import { adminProcedure, procedure } from "@/trpc";

export default router({
  create: procedure.input(createDeliveryNoteLineSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        if (input.unitPrice !== null && !ctx.isAdmin) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Solo el Administrador puede poner el precio de una Línea del Albarán",
          });
        }
        const txid = await generateTxId(tx);
        const resetInvoiceIds = await resetChangedDeliveryNoteInvoice(
          { deliveryNoteId: input.deliveryNoteId, isAdmin: ctx.isAdmin },
          tx,
        );
        const vatPercentage = await getConfigurationVatPercentage(tx);
        const newDeliveryNoteLine = (
          await tx
            .insert(dbTableDeliveryNoteLine)
            .values({ ...input, vatPercentage })
            .returning()
        ).at(0);
        if (!newDeliveryNoteLine) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Error al crear la Línea del Albarán",
          });
        }
        return { item: newDeliveryNoteLine, txid, resetInvoiceIds };
      } catch (error) {
        handleMutationError({ error });
      }
    }),
  ),
  update: procedure.input(updateDeliveryNoteLineSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const txid = await generateTxId(tx);
        const previousDeliveryNoteLine = await tx.query.dbTableDeliveryNoteLine.findFirst({ where: { id: input.id } });
        const updatedDeliveryNoteLine = (
          await tx
            .update(dbTableDeliveryNoteLine)
            .set(input)
            .where(eq(dbTableDeliveryNoteLine.id, input.id))
            .returning()
        ).at(0);
        if (!previousDeliveryNoteLine || !updatedDeliveryNoteLine) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Línea del Albarán con ID ${input.id} no encontrada`,
          });
        }
        const addedPendingQuantity = previousDeliveryNoteLine.quantity - updatedDeliveryNoteLine.quantity;
        const sellOrderLine =
          updatedDeliveryNoteLine.sellOrderLineId === null
            ? undefined
            : await getSellOrderLineById(updatedDeliveryNoteLine.sellOrderLineId, tx);
        if (sellOrderLine) assertPendingQuantityWithinQuantity(sellOrderLine, addedPendingQuantity);
        const updatedSellOrderLineId = await addSellOrderLinePendingQuantity(
          updatedDeliveryNoteLine.sellOrderLineId,
          addedPendingQuantity,
          tx,
        );
        const resetInvoiceIds = await resetChangedDeliveryNoteInvoice(
          { deliveryNoteId: updatedDeliveryNoteLine.deliveryNoteId, isAdmin: ctx.isAdmin },
          tx,
        );
        return {
          item: updatedDeliveryNoteLine,
          txid,
          resetInvoiceIds,
          updatedSellOrderLineIds: updatedSellOrderLineId === undefined ? [] : [updatedSellOrderLineId],
        };
      } catch (error) {
        handleMutationError({ error });
      }
    }),
  ),
  updatePrice: adminProcedure.input(updateDeliveryNoteLinePriceSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const txid = await generateTxId(tx);
        const updatedDeliveryNoteLine = (
          await tx
            .update(dbTableDeliveryNoteLine)
            .set({ unitPrice: input.unitPrice })
            .where(eq(dbTableDeliveryNoteLine.id, input.id))
            .returning()
        ).at(0);
        if (!updatedDeliveryNoteLine) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Línea del Albarán con ID ${input.id} no encontrada`,
          });
        }
        const resetInvoiceIds = await resetChangedDeliveryNoteInvoice(
          { deliveryNoteId: updatedDeliveryNoteLine.deliveryNoteId, isAdmin: ctx.isAdmin },
          tx,
        );
        return { item: updatedDeliveryNoteLine, txid, resetInvoiceIds };
      } catch (error) {
        handleMutationError({ error });
      }
    }),
  ),
  delete: adminProcedure.input(requiredIdObjectSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const txid = await generateTxId(tx);
        const deletedDeliveryNoteLineResult = await deleteDeliveryNoteLine(input.id, tx);
        const resetInvoiceIds = await resetChangedDeliveryNoteInvoice(
          {
            deliveryNoteId: deletedDeliveryNoteLineResult.deletedDeliveryNoteLine.deliveryNoteId,
            isAdmin: ctx.isAdmin,
          },
          tx,
        );
        return {
          item: deletedDeliveryNoteLineResult.deletedDeliveryNoteLine,
          txid,
          resetInvoiceIds,
          updatedSellOrderLineIds:
            deletedDeliveryNoteLineResult.updatedSellOrderLineId === undefined
              ? []
              : [deletedDeliveryNoteLineResult.updatedSellOrderLineId],
        };
      } catch (error) {
        handleMutationError({ error });
      }
    }),
  ),
});
