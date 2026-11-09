import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

import type { TDatabase } from "@/db";
import { getConfiguration, getConfigurationVatPercentage } from "@/db/functions/configuration";
import { getDeliveryNoteWithLinesForDocument, getNextDeliveryNoteId } from "@/db/functions/delivery-note";
import {
  addSellOrderLinePendingQuantity,
  assertPendingQuantityWithinQuantity,
  deleteDeliveryNoteLine,
} from "@/db/functions/delivery-note-line";
import { resetChangedDeliveryNoteInvoice, resetInvoiceStatus } from "@/db/functions/invoice";
import { dbTableDeliveryNote, dbTableDeliveryNoteLine, dbTableInvoice } from "@/db/schema";
import { printDeliveryNote } from "@/files/delivery-note";
import { getSalesDocumentLine } from "@/files/sales-document";
import { formatDate } from "@/lib/formatters";
import { handleMutationError } from "@/lib/handlers";
import { SELL_ORDER_LINE_NOT_OF_CLIENT_MESSAGE } from "@/messages/delivery-note";
import { requiredIdObjectSchema } from "@/schemas";
import {
  appendLinesToDeliveryNoteSchema,
  createDeliveryNoteSchema,
  createDeliveryNoteWithLinesSchema,
  printDeliveryNoteSchema,
  updateDeliveryNoteSchema,
} from "@/schemas/delivery-note";
import type { TStagedSellOrderLine } from "@/schemas/delivery-note";
import { router, generateTxId } from "@/trpc";
import { adminProcedure, procedure } from "@/trpc";
import type { BaseDeliveryNote } from "@/types/delivery-note";

async function insertStagedSellOrderLines(
  deliveryNote: BaseDeliveryNote,
  stagedSellOrderLines: Array<TStagedSellOrderLine>,
  tx: TDatabase,
): Promise<Array<number>> {
  const vatPercentage = await getConfigurationVatPercentage(tx);
  const updatedSellOrderLineIds: Array<number> = [];

  for (const stagedSellOrderLine of stagedSellOrderLines) {
    const sellOrderLine = await tx.query.dbTableSellOrderLine.findFirst({
      where: { id: stagedSellOrderLine.id },
      with: { sellOrder: true },
    });
    if (!sellOrderLine) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `Línea de pedido de venta ${stagedSellOrderLine.id} no encontrada`,
      });
    }
    if (sellOrderLine.sellOrder?.clientId !== deliveryNote.clientId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: SELL_ORDER_LINE_NOT_OF_CLIENT_MESSAGE(stagedSellOrderLine.id),
      });
    }
    assertPendingQuantityWithinQuantity(sellOrderLine, -stagedSellOrderLine.quantity);

    let description = sellOrderLine.description;
    if (sellOrderLine.partReferenceId !== null) {
      const partReference = await tx.query.dbTablePartReference.findFirst({
        where: { id: sellOrderLine.partReferenceId },
      });
      if (!partReference) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Referencia de pieza ${sellOrderLine.partReferenceId} no encontrada`,
        });
      }
      description = partReference.clientDescription;
    }

    await tx.insert(dbTableDeliveryNoteLine).values({
      deliveryNoteId: deliveryNote.id,
      description: description!,
      partReferenceId: sellOrderLine.partReferenceId,
      quantity: stagedSellOrderLine.quantity,
      sellOrderLineId: stagedSellOrderLine.id,
      vatPercentage,
    });

    const updatedSellOrderLineId = await addSellOrderLinePendingQuantity(
      sellOrderLine.id,
      -stagedSellOrderLine.quantity,
      tx,
    );
    if (updatedSellOrderLineId !== undefined) updatedSellOrderLineIds.push(updatedSellOrderLineId);
  }
  return updatedSellOrderLineIds;
}

export default router({
  nextId: procedure.query(async ({ ctx }) => getNextDeliveryNoteId(ctx.db)),
  create: procedure.input(createDeliveryNoteSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const txid = await generateTxId(tx);
        const newDeliveryNote = (
          await tx
            .insert(dbTableDeliveryNote)
            .values({ ...input, createdAt: new Date() })
            .returning()
        ).at(0);
        if (!newDeliveryNote) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Error al crear el Albarán",
          });
        }
        return { item: newDeliveryNote, txid };
      } catch (error) {
        handleMutationError({ error });
      }
    }),
  ),
  createWithLines: procedure.input(createDeliveryNoteWithLinesSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const txid = await generateTxId(tx);
        const deliveryNote = (
          await tx
            .insert(dbTableDeliveryNote)
            .values({
              clientId: input.clientId,
              createdAt: new Date(),
              deliveryDate: new Date(),
              deliveryMethodId: input.deliveryMethodId,
            })
            .returning()
        ).at(0);

        if (deliveryNote === undefined) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Albarán no creado",
          });
        }

        const updatedSellOrderLineIds = await insertStagedSellOrderLines(deliveryNote, input.stagedSellOrderLines, tx);
        return { item: deliveryNote, txid, updatedSellOrderLineIds };
      } catch (error) {
        handleMutationError({ error });
      }
    }),
  ),
  appendLines: procedure.input(appendLinesToDeliveryNoteSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const txid = await generateTxId(tx);
        const deliveryNote = await tx.query.dbTableDeliveryNote.findFirst({
          where: { id: input.deliveryNoteId },
        });
        if (!deliveryNote) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Albarán con ID ${input.deliveryNoteId} no encontrado`,
          });
        }
        const resetInvoiceIds = await resetChangedDeliveryNoteInvoice(
          { deliveryNoteId: deliveryNote.id, isAdmin: ctx.isAdmin },
          tx,
        );

        const updatedSellOrderLineIds = await insertStagedSellOrderLines(deliveryNote, input.stagedSellOrderLines, tx);
        return { item: deliveryNote, resetInvoiceIds, txid, updatedSellOrderLineIds };
      } catch (error) {
        handleMutationError({ error });
      }
    }),
  ),
  update: adminProcedure.input(updateDeliveryNoteSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const txid = await generateTxId(tx);
        const previousDeliveryNote = await tx.query.dbTableDeliveryNote.findFirst({ where: { id: input.id } });
        const updatedDeliveryNote = (
          await tx.update(dbTableDeliveryNote).set(input).where(eq(dbTableDeliveryNote.id, input.id)).returning()
        ).at(0);
        if (!previousDeliveryNote || !updatedDeliveryNote) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Albarán con ID ${input.id} no encontrado`,
          });
        }
        // The Factura lists the delivery date of its Albaranes, so the one the Cliente got no longer matches it
        if (
          updatedDeliveryNote.invoiceId !== null &&
          previousDeliveryNote.deliveryDate?.getTime() !== updatedDeliveryNote.deliveryDate?.getTime()
        ) {
          await tx
            .update(dbTableInvoice)
            .set({ sent: false })
            .where(eq(dbTableInvoice.id, updatedDeliveryNote.invoiceId));
        }
        return { item: updatedDeliveryNote, txid };
      } catch (error) {
        handleMutationError({ error });
      }
    }),
  ),
  delete: adminProcedure.input(requiredIdObjectSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const txid = await generateTxId(tx);

        const deliveryNoteLines = await tx.query.dbTableDeliveryNoteLine.findMany({
          where: { deliveryNoteId: input.id },
        });

        const updatedSellOrderLineIds: Array<number> = [];

        for (const deliveryNoteLine of deliveryNoteLines) {
          const { updatedSellOrderLineId } = await deleteDeliveryNoteLine(deliveryNoteLine.id, tx);
          if (updatedSellOrderLineId !== undefined) {
            updatedSellOrderLineIds.push(updatedSellOrderLineId);
          }
        }

        const deletedDeliveryNote = (
          await tx.delete(dbTableDeliveryNote).where(eq(dbTableDeliveryNote.id, input.id)).returning()
        ).at(0);
        if (!deletedDeliveryNote) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Albarán con ID ${input.id} no encontrado`,
          });
        }
        // The Factura is computed from its Albaranes, so it has to be accounted and sent again without this one
        const resetInvoice =
          deletedDeliveryNote.invoiceId === null
            ? undefined
            : await resetInvoiceStatus(deletedDeliveryNote.invoiceId, tx);
        return {
          deletedDeliveryNoteLineIds: deliveryNoteLines.map((line) => line.id),
          item: deletedDeliveryNote,
          txid,
          resetInvoiceIds: resetInvoice === undefined ? [] : [resetInvoice.id],
          updatedSellOrderLineIds,
        };
      } catch (error) {
        handleMutationError({ error });
      }
    }),
  ),
  print: procedure.input(printDeliveryNoteSchema).mutation(async ({ input }) => {
    const deliveryNote = await getDeliveryNoteWithLinesForDocument(input.id);
    if (!deliveryNote) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `Albarán con ID ${input.id} no encontrado`,
      });
    }

    const configuration = await getConfiguration();
    if (!configuration) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "No se ha configurado los datos de la empresa",
      });
    }

    await printDeliveryNote({
      client: deliveryNote.client,
      company: configuration,
      copies: input.copies,
      deliveryDate: formatDate(deliveryNote.deliveryDate),
      deliveryMethodName: deliveryNote.deliveryMethod?.name ?? null,
      deliveryNoteId: deliveryNote.id,
      lines: deliveryNote.deliveryNoteLines.map(getSalesDocumentLine),
      withPrices: input.withPrices,
    });
  }),
});
