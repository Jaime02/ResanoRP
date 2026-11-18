import fs from "node:fs";
import path from "node:path";

import { TRPCError } from "@trpc/server";
import { and, eq, isNotNull } from "drizzle-orm";

import { getClientById } from "@/db/functions/client";
import { getCoatingById } from "@/db/functions/coating";
import { getDeliveryNote } from "@/db/functions/delivery-note";
import { getDeliveryNoteLine } from "@/db/functions/delivery-note-line";
import { getActivePartSetsUsingPart, getPartById } from "@/db/functions/part";
import { getPartReferenceById } from "@/db/functions/part-reference";
import { getSellOrderById } from "@/db/functions/sell-order";
import { getSellOrderLineById } from "@/db/functions/sell-order-line";
import { dbTableBlueprint, dbTablePart, dbTablePartReference } from "@/db/schema";
import { archiveBlueprintFiles } from "@/files/blueprint";
import { removeOnRollback } from "@/files/functions";
import { printTagPart } from "@/files/part-tag";
import { handleMutationError } from "@/lib/handlers";
import { getPartTagName, getTagSellOrder, PartTagSource } from "@/lib/part-tag";
import type { TTagSellOrder } from "@/lib/part-tag";
import { PART_IN_ACTIVE_SETS_ERROR_MESSAGE } from "@/messages/part";
import { requiredIdObjectSchema } from "@/schemas";
import { printTagPartSchema } from "@/schemas/delivery-note-line";
import { createPartFormDataSchema, updatePartSchema } from "@/schemas/part";
import { sanitizePath } from "@/schemas/utils";
import { router } from "@/trpc";
import { adminProcedure, procedure } from "@/trpc";
import { createBlueprint } from "@/trpc/blueprint";
import type { BaseCoating } from "@/types/coating";
import type { BasePart } from "@/types/part";
import type { BasePartReference } from "@/types/part-reference";

function createPartFolder(part: { id: number; description: string }, createdPaths: Array<string>) {
  const partFolder = path.join(
    process.env.BLUEPRINT_ROOT_PATH!,
    sanitizePath(part.description) !== null ? `${part.id} - ${sanitizePath(part.description)}` : `${part.id}`,
  );
  fs.mkdirSync(partFolder);
  createdPaths.push(partFolder);
}

export default router({
  createWithPartReference: adminProcedure.input(createPartFormDataSchema).mutation(async ({ ctx, input }) =>
    removeOnRollback(async (createdPaths) =>
      ctx.db.transaction(async (tx) => {
        try {
          const { blueprint, fileName, clientDescription, clientId, reference, ...partData } = input;
          const newPart = (await tx.insert(dbTablePart).values(partData).returning()).at(0);
          if (!newPart) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Error al crear el Artículo" });
          }
          const newPartReference = (
            await tx
              .insert(dbTablePartReference)
              .values({ clientDescription, clientId, partId: newPart.id, reference })
              .returning()
          ).at(0);
          if (!newPartReference) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Error al crear la Referencia del Artículo",
            });
          }
          createPartFolder(newPart, createdPaths);
          if (blueprint != null && fileName !== undefined) {
            await createBlueprint(tx, { blueprint, fileName, partId: newPart.id }, createdPaths);
          }
          return { item: newPart };
        } catch (error) {
          handleMutationError({ error });
        }
      }),
    ),
  ),
  update: adminProcedure.input(updatePartSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const updatedPart = (
          await tx.update(dbTablePart).set(input).where(eq(dbTablePart.id, input.id)).returning()
        ).at(0);
        if (!updatedPart) {
          throw new TRPCError({ code: "NOT_FOUND", message: `Artículo con ID ${input.id} no encontrado` });
        }
        return { item: updatedPart };
      } catch (error) {
        handleMutationError({ error });
      }
    }),
  ),
  delete: adminProcedure.input(requiredIdObjectSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const partSetsUsingPart = await getActivePartSetsUsingPart(input.id, tx);
        if (partSetsUsingPart.length > 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `${PART_IN_ACTIVE_SETS_ERROR_MESSAGE} ${partSetsUsingPart.map((partSet) => `"${partSet.description}"`).join(", ")}`,
          });
        }
        const deletedPart = (
          await tx.update(dbTablePart).set({ deletedAt: new Date() }).where(eq(dbTablePart.id, input.id)).returning()
        ).at(0);
        if (!deletedPart) {
          throw new TRPCError({ code: "NOT_FOUND", message: `Artículo con ID ${input.id} no encontrado` });
        }
        const deletedBlueprints = await tx
          .delete(dbTableBlueprint)
          .where(eq(dbTableBlueprint.partId, input.id))
          .returning();
        const blueprintWithoutFile = await archiveBlueprintFiles(deletedBlueprints);
        if (blueprintWithoutFile !== undefined) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `No se encontró la ruta del archivo para el Plano con ID ${blueprintWithoutFile.id}`,
          });
        }
        return { item: deletedPart };
      } catch (error) {
        handleMutationError({ error });
      }
    }),
  ),
  restore: adminProcedure.input(requiredIdObjectSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const restoredPart = (
          await tx
            .update(dbTablePart)
            .set({ deletedAt: null })
            .where(and(eq(dbTablePart.id, input.id), isNotNull(dbTablePart.deletedAt)))
            .returning()
        ).at(0);
        if (!restoredPart) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Artículo con ID ${input.id} no encontrado o no eliminado`,
          });
        }
        return { item: restoredPart };
      } catch (error) {
        handleMutationError({ error });
      }
    }),
  ),
  printTag: procedure.input(printTagPartSchema).mutation(async ({ input }) => {
    let reference: string | undefined;
    let partReferenceId: number | null;
    // A Línea del Albarán added by hand belongs to no Pedido de venta, so the tag is printed without it
    const sellOrders: Array<TTagSellOrder> = [];
    let tagName: string;
    let clientId: number | undefined;

    if (input.deliveryNoteLineId !== undefined) {
      const deliveryNoteLine = await getDeliveryNoteLine({ id: input.deliveryNoteLineId });
      if (!deliveryNoteLine) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Línea de Albarán no encontrada",
        });
      }

      if (deliveryNoteLine.sellOrderLineId !== null) {
        const sellOrderLine = await getSellOrderLineById(deliveryNoteLine.sellOrderLineId);
        const sellOrder = sellOrderLine && (await getSellOrderById(sellOrderLine.sellOrderId));
        if (sellOrder) sellOrders.push(getTagSellOrder(sellOrder, sellOrderLine.requestedDeliveryDate, Infinity));
      }

      clientId = (await getDeliveryNote({ id: deliveryNoteLine.deliveryNoteId }))?.clientId;
      reference = deliveryNoteLine.description;
      partReferenceId = deliveryNoteLine.partReferenceId;
      tagName = getPartTagName(PartTagSource.DeliveryNoteLine, deliveryNoteLine.id);
    } else {
      const sellOrderLines = await Promise.all(input.sellOrderLines.map(async ({ id }) => getSellOrderLineById(id)));
      if (sellOrderLines.some((sellOrderLine) => sellOrderLine === undefined)) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Línea del Pedido de Venta no encontrada",
        });
      }
      const definedSellOrderLines = sellOrderLines.filter((sellOrderLine) => sellOrderLine !== undefined);

      // One tag can only hold a single part, a line without one is printed on its own
      const partReferenceIds = [
        ...new Set(definedSellOrderLines.map((sellOrderLine) => sellOrderLine.partReferenceId)),
      ];
      const partIdByReferenceId = new Map(
        await Promise.all(
          partReferenceIds.map(
            async (id) => [id, id === null ? null : (await getPartReferenceById(id))?.partId] as const,
          ),
        ),
      );
      const partIds = new Set(partIdByReferenceId.values());
      if (partIds.size !== 1 || (partIds.has(null) && definedSellOrderLines.length > 1)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Las líneas del Pedido de Venta no son del mismo artículo",
        });
      }

      const sellOrderIds = [...new Set(definedSellOrderLines.map((sellOrderLine) => sellOrderLine.sellOrderId))];
      const sellOrderById = new Map(
        (await Promise.all(sellOrderIds.map(async (id) => getSellOrderById(id))))
          .filter((sellOrder) => sellOrder !== undefined)
          .map((sellOrder) => [sellOrder.id, sellOrder]),
      );
      if (sellOrderById.size !== sellOrderIds.length) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Pedido de Venta no encontrado",
        });
      }
      const lineSellOrders = definedSellOrderLines.flatMap(
        (sellOrderLine) => sellOrderById.get(sellOrderLine.sellOrderId) ?? [],
      );
      // A box is sent to a single Cliente
      const clientIds = new Set(lineSellOrders.map((sellOrder) => sellOrder.clientId));
      if (clientIds.size !== 1) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Las líneas del Pedido de Venta no son del mismo cliente",
        });
      }
      [clientId] = clientIds;

      for (const [index, sellOrder] of lineSellOrders.entries()) {
        sellOrders.push(
          getTagSellOrder(
            sellOrder,
            definedSellOrderLines[index].requestedDeliveryDate,
            input.sellOrderLines[index].quantity,
          ),
        );
      }

      const [sellOrderLine] = definedSellOrderLines;
      reference = sellOrderLine.description ?? undefined;
      partReferenceId = sellOrderLine.partReferenceId;
      tagName = getPartTagName(PartTagSource.SellOrderLine, sellOrderLine.id);
    }

    let partReference: BasePartReference | undefined;
    let part: BasePart | undefined;
    let coating: BaseCoating | undefined;

    if (partReferenceId !== null) {
      partReference = await getPartReferenceById(partReferenceId);
      if (!partReference) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Referencia de pieza no encontrada",
        });
      }

      part = await getPartById(partReference.partId);
      if (part === undefined) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Pieza no encontrada",
        });
      }

      if (part.coatingId !== null) {
        coating = await getCoatingById(part.coatingId);
      }
      reference = partReference.reference;
    }

    if (reference === undefined) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "No se pudo determinar el artículo para el que generar la etiqueta",
      });
    }

    const client = clientId !== undefined ? await getClientById(clientId) : undefined;

    await printTagPart({
      clientName: client?.name,
      coatingName: coating?.name,
      partDescription: part?.description,
      reference,
      sellOrders,
      labelSize: input.labelSize,
      tagGroups: input.tagGroups,
      tagName,
    });
  }),
});
