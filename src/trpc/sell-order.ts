import fs from "node:fs";

import { TRPCError } from "@trpc/server";
import { and, eq, isNotNull } from "drizzle-orm";

import type { TDatabase } from "@/db";
import { removeProductionOrdersFromMachines } from "@/db/functions/machine-production-order-queue";
import {
  SELL_ORDER_REFERENCE_CONSTRAINT,
  dbTableProductionOrder,
  dbTableSellOrder,
  dbTableSellOrderLine,
} from "@/db/schema";
import { renameFile, saveUpload } from "@/files/functions";
import { getSellOrderPath } from "@/files/sell-order";
import { handleMutationError } from "@/lib/handlers";
import { requiredIdObjectSchema, requiredIdSchema } from "@/schemas";
import { createSellOrderFormDataSchema, updateSellOrderFormDataSchema } from "@/schemas/sell-order";
import { dateToFileName } from "@/schemas/utils";
import { adminProcedure, generateTxId, router } from "@/trpc";
import type { BaseSellOrder } from "@/types/sell-order";

const uniqueConstraints = [
  {
    constraintName: SELL_ORDER_REFERENCE_CONSTRAINT,
    errorMessage: "El Cliente ya tiene un Pedido de venta con esa referencia",
  },
];

async function saveSellOrderFile(sellOrder: BaseSellOrder, sellOrderFile: File, tx: TDatabase) {
  const filePath = await getSellOrderPath(
    {
      clientId: sellOrder.clientId,
      sellOrderId: sellOrder.id,
      createFoldersIfNotExist: true,
    },
    tx,
  );
  if (filePath === null) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Error al guardar el archivo del Pedido de venta",
    });
  }
  // A replaced file is kept, renamed as deleteFile does
  if (fs.existsSync(filePath)) {
    await renameFile({ filePath, newFileName: `DELETED_${dateToFileName(new Date())}.${sellOrder.id}.pdf` });
  }
  await saveUpload({
    fileUpload: sellOrderFile,
    location: filePath,
  });
}

export default router({
  create: adminProcedure.input(createSellOrderFormDataSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const txid = await generateTxId(tx);
        const { sellOrderFile, ...sellOrder } = input;
        const newSellOrder = (
          await tx
            .insert(dbTableSellOrder)
            .values({ ...sellOrder, fileUploadedAt: sellOrderFile != null ? new Date() : null })
            .returning()
        ).at(0);

        if (!newSellOrder) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Error al crear el Pedido de venta",
          });
        }

        if (sellOrderFile != null) {
          await saveSellOrderFile(newSellOrder, sellOrderFile, tx);
        }
        return { item: newSellOrder, txid };
      } catch (error) {
        handleMutationError({ error, uniqueConstraints });
      }
    }),
  ),
  update: adminProcedure.input(updateSellOrderFormDataSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const txid = await generateTxId(tx);
        const { sellOrderFile, ...sellOrder } = input;
        const updatedSellOrder = (
          await tx
            .update(dbTableSellOrder)
            .set({ ...sellOrder, ...(sellOrderFile != null ? { fileUploadedAt: new Date() } : {}) })
            .where(eq(dbTableSellOrder.id, input.id))
            .returning()
        ).at(0);
        if (!updatedSellOrder) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Pedido de venta con ID ${input.id} no encontrado`,
          });
        }
        if (sellOrderFile != null) {
          await saveSellOrderFile(updatedSellOrder, sellOrderFile, tx);
        }
        return { item: updatedSellOrder, txid };
      } catch (error) {
        handleMutationError({ error, uniqueConstraints });
      }
    }),
  ),
  delete: adminProcedure.input(requiredIdObjectSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const txid = await generateTxId(tx);
        const deletedSellOrder = (
          await tx
            .update(dbTableSellOrder)
            .set({ deletedAt: new Date() })
            .where(eq(dbTableSellOrder.id, input.id))
            .returning()
        ).at(0);
        if (!deletedSellOrder) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Pedido de venta con ID ${input.id} no encontrado`,
          });
        }
        const productionOrders = await tx
          .select({ id: dbTableProductionOrder.id })
          .from(dbTableProductionOrder)
          .innerJoin(dbTableSellOrderLine, eq(dbTableProductionOrder.sellOrderLineId, dbTableSellOrderLine.id))
          .where(eq(dbTableSellOrderLine.sellOrderId, input.id));
        return {
          item: deletedSellOrder,
          txid,
          ...(await removeProductionOrdersFromMachines(
            productionOrders.map((productionOrder) => productionOrder.id),
            tx,
          )),
        };
      } catch (error) {
        handleMutationError({ error });
      }
    }),
  ),
  restore: adminProcedure.input(requiredIdSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const txid = await generateTxId(tx);
        const restoredSellOrder = (
          await tx
            .update(dbTableSellOrder)
            .set({ deletedAt: null })
            .where(and(eq(dbTableSellOrder.id, input), isNotNull(dbTableSellOrder.deletedAt)))
            .returning()
        ).at(0);
        if (!restoredSellOrder) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Pedido de venta con ID ${input} no encontrado o no eliminado`,
          });
        }
        return { item: restoredSellOrder, txid };
      } catch (error) {
        handleMutationError({ error, uniqueConstraints });
      }
    }),
  ),
  deleteFile: adminProcedure.input(requiredIdSchema).mutation(async ({ ctx, input: sellOrderId }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const txid = await generateTxId(tx);
        const updatedSellOrder = (
          await tx
            .update(dbTableSellOrder)
            .set({ fileUploadedAt: null })
            .where(eq(dbTableSellOrder.id, sellOrderId))
            .returning()
        ).at(0);
        if (!updatedSellOrder) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Pedido de venta con ID ${sellOrderId} no encontrado`,
          });
        }
        const filePath = await getSellOrderPath({ clientId: updatedSellOrder.clientId, sellOrderId }, tx);
        if (filePath === null) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `No se encontró la ruta del archivo para el Pedido de venta con ID ${sellOrderId}`,
          });
        }
        await renameFile({
          filePath,
          newFileName: `DELETED_${dateToFileName(new Date())}.${sellOrderId}.pdf`,
        });
        return { item: updatedSellOrder, txid };
      } catch (error) {
        handleMutationError({ error });
      }
    }),
  ),
});
