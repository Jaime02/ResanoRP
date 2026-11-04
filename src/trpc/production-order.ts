import { TRPCError } from "@trpc/server";
import { and, eq, isNotNull } from "drizzle-orm";

import type { TDatabase } from "@/db";
import { getCoatingById } from "@/db/functions/coating";
import { removeProductionOrdersFromMachines } from "@/db/functions/machine-production-order-queue";
import { getPartById } from "@/db/functions/part";
import { getPartReferenceById, getPartReferencesByPartId } from "@/db/functions/part-reference";
import { getProductionOrderById } from "@/db/functions/production-order";
import { getSellOrderById } from "@/db/functions/sell-order";
import { getSellOrderLineById } from "@/db/functions/sell-order-line";
import { dbTableProductionOrder } from "@/db/schema";
import { printTagPart } from "@/files/part-tag";
import { formatDate } from "@/lib/formatters";
import { handleMutationError } from "@/lib/handlers";
import { requiredIdObjectSchema } from "@/schemas";
import {
  createProductionOrderSchema,
  printTagPartProductionSchema,
  updateProductionOrderSchema,
} from "@/schemas/production-order";
import { router, generateTxId } from "@/trpc";
import { adminProcedure, procedure } from "@/trpc";
import type { BasePartReference } from "@/types/part-reference";

async function assertSellOrderLineCanBeProduced(sellOrderLineId: number, partId: number, tx: TDatabase) {
  const sellOrderLine = await getSellOrderLineById(sellOrderLineId, tx);
  if (!sellOrderLine) {
    throw new TRPCError({ code: "NOT_FOUND", message: `Línea de pedido de venta ${sellOrderLineId} no encontrada` });
  }
  if (sellOrderLine.deletedAt !== null) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `La Línea de pedido de venta ${sellOrderLineId} está eliminada`,
    });
  }
  if (sellOrderLine.quantity < 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `La Línea de pedido de venta ${sellOrderLineId} es una devolución`,
    });
  }
  const sellOrder = await getSellOrderById(sellOrderLine.sellOrderId, tx);
  if (sellOrder?.deletedAt != null) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `El Pedido de venta de la Línea ${sellOrderLineId} está eliminado`,
    });
  }
  const partReference =
    sellOrderLine.partReferenceId !== null ? await getPartReferenceById(sellOrderLine.partReferenceId, tx) : undefined;
  if (partReference?.partId !== partId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `La Línea de pedido de venta ${sellOrderLineId} no es del Artículo ${partId}`,
    });
  }
}

export default router({
  create: adminProcedure.input(createProductionOrderSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const txid = await generateTxId(tx);
        const part = await getPartById(input.partId, tx);
        if (!part) {
          throw new TRPCError({ code: "NOT_FOUND", message: `Artículo con ID ${input.partId} no encontrado` });
        }
        if (part.deletedAt !== null) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `El Artículo "${part.description}" está eliminado` });
        }
        if (input.sellOrderLineId !== null) {
          await assertSellOrderLineCanBeProduced(input.sellOrderLineId, input.partId, tx);
        }
        const newProductionOrder = (
          await tx
            .insert(dbTableProductionOrder)
            .values({ ...input, createdAt: new Date() })
            .returning()
        ).at(0);

        if (!newProductionOrder) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Error al crear la Orden de producción",
          });
        }
        return { item: newProductionOrder, txid };
      } catch (error) {
        handleMutationError({ error });
      }
    }),
  ),
  update: adminProcedure.input(updateProductionOrderSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const txid = await generateTxId(tx);
        const updatedProductionOrder = (
          await tx.update(dbTableProductionOrder).set(input).where(eq(dbTableProductionOrder.id, input.id)).returning()
        ).at(0);
        if (!updatedProductionOrder) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Orden de producción con ID ${input.id} no encontrada`,
          });
        }
        return { item: updatedProductionOrder, txid };
      } catch (error) {
        handleMutationError({ error });
      }
    }),
  ),
  delete: adminProcedure.input(requiredIdObjectSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const txid = await generateTxId(tx);
        const deletedProductionOrder = (
          await tx
            .update(dbTableProductionOrder)
            .set({ deletedAt: new Date() })
            .where(eq(dbTableProductionOrder.id, input.id))
            .returning()
        ).at(0);
        if (!deletedProductionOrder) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Orden de producción con ID ${input.id} no encontrada`,
          });
        }
        return {
          item: deletedProductionOrder,
          txid,
          ...(await removeProductionOrdersFromMachines([deletedProductionOrder.id], tx)),
        };
      } catch (error) {
        handleMutationError({ error });
      }
    }),
  ),
  restore: adminProcedure.input(requiredIdObjectSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const txid = await generateTxId(tx);
        const restoredProductionOrder = (
          await tx
            .update(dbTableProductionOrder)
            .set({ deletedAt: null })
            .where(and(eq(dbTableProductionOrder.id, input.id), isNotNull(dbTableProductionOrder.deletedAt)))
            .returning()
        ).at(0);
        if (!restoredProductionOrder) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Orden de producción con ID ${input.id} no encontrada o no eliminada`,
          });
        }
        return { item: restoredProductionOrder, txid };
      } catch (error) {
        handleMutationError({ error });
      }
    }),
  ),
  printTag: procedure.input(printTagPartProductionSchema).mutation(async ({ input }) => {
    const productionOrder = await getProductionOrderById(input.productionOrderId);
    if (!productionOrder) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `Orden de producción con ID ${input.productionOrderId} no encontrada`,
      });
    }

    const part = await getPartById(productionOrder.partId);
    if (!part) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `Artículo con ID ${productionOrder.partId} no encontrado`,
      });
    }

    const sellOrderLine =
      productionOrder.sellOrderLineId !== null
        ? await getSellOrderLineById(productionOrder.sellOrderLineId)
        : undefined;
    const sellOrder = sellOrderLine !== undefined ? await getSellOrderById(sellOrderLine.sellOrderId) : undefined;

    let partReference: BasePartReference | undefined;
    if (sellOrderLine?.partReferenceId != null) {
      partReference = await getPartReferenceById(sellOrderLine.partReferenceId);
    } else {
      // Without a Pedido de venta the Referencia is only unambiguous when the Artículo has a single one
      const partReferences = await getPartReferencesByPartId(part.id);
      partReference = partReferences.length === 1 ? partReferences[0] : undefined;
    }

    const coating = part.coatingId !== null ? await getCoatingById(part.coatingId) : undefined;

    await printTagPart({
      coatingName: coating?.name,
      partDescription: part.description,
      reference: partReference?.reference,
      requestedDeliveryDate:
        sellOrderLine?.requestedDeliveryDate != null
          ? (formatDate(sellOrderLine.requestedDeliveryDate) ?? undefined)
          : undefined,
      sellOrderReference: sellOrder !== undefined ? (sellOrder.clientReference ?? String(sellOrder.id)) : undefined,
      tagGroups: [{ partQuantity: input.partQuantity, tagQuantity: 1 }],
      tagName: `production-order-${productionOrder.id}`,
    });
  }),
});
