import fs from "node:fs";
import path from "node:path";

import { TRPCError } from "@trpc/server";
import { and, eq, isNotNull } from "drizzle-orm";

import { getCoatingById } from "@/db/functions/coating";
import { getDeliveryNoteLine } from "@/db/functions/delivery-note-line";
import { getPartById } from "@/db/functions/part";
import { getPartReferenceById } from "@/db/functions/part-reference";
import { getSellOrderById } from "@/db/functions/sell-order";
import { getSellOrderLineById } from "@/db/functions/sell-order-line";
import { dbTableBlueprint, dbTablePart, dbTablePartReference } from "@/db/schema";
import { archiveBlueprintFiles } from "@/files/blueprint";
import { removeOnRollback } from "@/files/functions";
import { printTagPart } from "@/files/part-tag";
import { formatDate } from "@/lib/formatters";
import { handleMutationError } from "@/lib/handlers";
import { requiredIdObjectSchema } from "@/schemas";
import { printTagPartSchema } from "@/schemas/delivery-note-line";
import { createPartFormDataSchema, updatePartSchema } from "@/schemas/part";
import { sanitizePath } from "@/schemas/utils";
import { router, generateTxId } from "@/trpc";
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
          const txid = await generateTxId(tx);
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
          return { item: newPart, txid };
        } catch (error) {
          handleMutationError({ error });
        }
      }),
    ),
  ),
  update: adminProcedure.input(updatePartSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const txid = await generateTxId(tx);
        const updatedPart = (
          await tx.update(dbTablePart).set(input).where(eq(dbTablePart.id, input.id)).returning()
        ).at(0);
        if (!updatedPart) {
          throw new TRPCError({ code: "NOT_FOUND", message: `Artículo con ID ${input.id} no encontrado` });
        }
        return { item: updatedPart, txid };
      } catch (error) {
        handleMutationError({ error });
      }
    }),
  ),
  delete: adminProcedure.input(requiredIdObjectSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const txid = await generateTxId(tx);
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
        return {
          item: deletedPart,
          txid,
          deletedBlueprintIds: deletedBlueprints.map((blueprint) => blueprint.id),
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
        return { item: restoredPart, txid };
      } catch (error) {
        handleMutationError({ error });
      }
    }),
  ),
  printTag: procedure.input(printTagPartSchema).mutation(async ({ input }) => {
    let reference: string | undefined;
    let partReferenceId: number | null;
    // A Línea del Albarán added by hand belongs to no Pedido de venta, so the tag is printed without it
    let sellOrderId: number | undefined;
    let requestedDeliveryDate: Date | null | undefined;
    let tagName: string;

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
        sellOrderId = sellOrderLine?.sellOrderId;
        requestedDeliveryDate = sellOrderLine?.requestedDeliveryDate;
      }

      reference = deliveryNoteLine.description;
      partReferenceId = deliveryNoteLine.partReferenceId;
      tagName = `delivery-note-line-${deliveryNoteLine.id}`;
    } else {
      const sellOrderLine = await getSellOrderLineById(input.sellOrderLineId);
      if (!sellOrderLine) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Línea del Pedido de Venta no encontrada",
        });
      }

      reference = sellOrderLine.description ?? undefined;
      partReferenceId = sellOrderLine.partReferenceId;
      sellOrderId = sellOrderLine.sellOrderId;
      requestedDeliveryDate = sellOrderLine.requestedDeliveryDate;
      tagName = `sell-order-line-${sellOrderLine.id}`;
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

    const sellOrder = sellOrderId !== undefined ? await getSellOrderById(sellOrderId) : undefined;

    await printTagPart({
      coatingName: coating?.name,
      partDescription: part?.description,
      reference,
      requestedDeliveryDate:
        requestedDeliveryDate != null ? (formatDate(requestedDeliveryDate) ?? undefined) : undefined,
      sellOrderReference: sellOrder !== undefined ? (sellOrder.clientReference ?? String(sellOrder.id)) : undefined,
      tagGroups: input.tagGroups,
      tagName,
    });
  }),
});
