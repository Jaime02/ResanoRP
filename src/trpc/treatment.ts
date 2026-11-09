import { TRPCError } from "@trpc/server";
import { asc, eq, inArray, sql } from "drizzle-orm";

import type { TDatabase } from "@/db";
import { dbGetProductionOrderStatus } from "@/db/functions/production-order";
import { dbTableTreatmentReception, dbTableTreatmentShipment } from "@/db/schema";
import { handleMutationError } from "@/lib/handlers";
import { translatedEnums } from "@/lib/translations";
import {
  PART_WITHOUT_COATING_MESSAGE,
  PRODUCTION_ORDER_NOT_SENDABLE_MESSAGE,
  PRODUCTION_ORDER_PART_WITHOUT_COATING_MESSAGE,
  SHIPMENT_PENDING_QUANTITY_EXCEEDED_MESSAGE,
  SHIPMENT_WITH_RECEPTIONS_MESSAGE,
} from "@/messages/treatment";
import { requiredIdObjectSchema } from "@/schemas";
import { ProductionOrderStatus } from "@/schemas/production-order";
import { receiveTreatmentSchema, sendPartTreatmentSchema, sendTreatmentSchema } from "@/schemas/treatment";
import { generateTxId, procedure, router } from "@/trpc";

const DELETED_STATUSES = [
  ProductionOrderStatus.Deleted,
  ProductionOrderStatus.SellOrderDeleted,
  ProductionOrderStatus.SellOrderLineDeleted,
];

async function getShipmentReceivedQuantity(treatmentShipmentId: number, tx: TDatabase) {
  const [received] = await tx
    .select({ quantity: sql<number>`coalesce(sum(${dbTableTreatmentReception.quantity}), 0)`.mapWith(Number) })
    .from(dbTableTreatmentReception)
    .where(eq(dbTableTreatmentReception.treatmentShipmentId, treatmentShipmentId));
  return received.quantity;
}

export default router({
  send: procedure.input(sendTreatmentSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const txid = await generateTxId(tx);
        const productionOrders = await tx.query.dbTableProductionOrder.findMany({
          where: { id: { in: input.map((item) => item.productionOrderId) } },
          with: { part: true },
        });

        for (const item of input) {
          const productionOrder = productionOrders.find(({ id }) => id === item.productionOrderId);
          if (!productionOrder) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: `Orden de producción con ID ${item.productionOrderId} no encontrada`,
            });
          }
          if (productionOrder.part.coatingId === null) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: PRODUCTION_ORDER_PART_WITHOUT_COATING_MESSAGE(productionOrder.id),
            });
          }
          const status = await dbGetProductionOrderStatus(productionOrder, tx);
          if (DELETED_STATUSES.includes(status)) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: PRODUCTION_ORDER_NOT_SENDABLE_MESSAGE(
                productionOrder.id,
                translatedEnums.ProductionOrderStatus[status],
              ),
            });
          }
        }

        const sentAt = new Date();
        const treatmentShipments = await tx
          .insert(dbTableTreatmentShipment)
          .values(
            input.map((item) => ({
              ...item,
              partId: productionOrders.find(({ id }) => id === item.productionOrderId)!.partId,
              sentAt,
            })),
          )
          .returning();
        return { item: { treatmentShipments }, txid };
      } catch (error) {
        handleMutationError({ error });
      }
    }),
  ),
  sendPart: procedure.input(sendPartTreatmentSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const txid = await generateTxId(tx);
        const part = await tx.query.dbTablePart.findFirst({ where: { id: input.partId } });
        if (!part) {
          throw new TRPCError({ code: "NOT_FOUND", message: `Artículo con ID ${input.partId} no encontrado` });
        }
        if (part.deletedAt !== null) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `El Artículo "${part.description}" está eliminado` });
        }
        if (part.coatingId === null) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: PART_WITHOUT_COATING_MESSAGE(part.description),
          });
        }
        const [treatmentShipment] = await tx
          .insert(dbTableTreatmentShipment)
          .values({ ...input, sentAt: new Date() })
          .returning();
        return { item: treatmentShipment, txid };
      } catch (error) {
        handleMutationError({ error });
      }
    }),
  ),
  receive: procedure.input(receiveTreatmentSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const txid = await generateTxId(tx);
        const treatmentShipments = await tx
          .select()
          .from(dbTableTreatmentShipment)
          .where(
            inArray(
              dbTableTreatmentShipment.id,
              input.map((item) => item.treatmentShipmentId),
            ),
          )
          .orderBy(asc(dbTableTreatmentShipment.id))
          .for("update");

        for (const item of input) {
          const treatmentShipment = treatmentShipments.find(({ id }) => id === item.treatmentShipmentId);
          if (!treatmentShipment) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: `Envío al tratamiento con ID ${item.treatmentShipmentId} no encontrado`,
            });
          }
          const pendingQuantity =
            treatmentShipment.quantity - (await getShipmentReceivedQuantity(treatmentShipment.id, tx));
          if (item.quantity > pendingQuantity) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: SHIPMENT_PENDING_QUANTITY_EXCEEDED_MESSAGE(treatmentShipment.id, pendingQuantity),
            });
          }
        }

        const receivedAt = new Date();
        const treatmentReceptions = await tx
          .insert(dbTableTreatmentReception)
          .values(input.map((item) => ({ ...item, receivedAt })))
          .returning();
        return { item: { treatmentReceptions }, txid };
      } catch (error) {
        handleMutationError({ error });
      }
    }),
  ),
  deleteShipment: procedure.input(requiredIdObjectSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const txid = await generateTxId(tx);
        const reception = await tx.query.dbTableTreatmentReception.findFirst({
          where: { treatmentShipmentId: input.id },
        });
        if (reception) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: SHIPMENT_WITH_RECEPTIONS_MESSAGE,
          });
        }
        const deletedShipment = (
          await tx.delete(dbTableTreatmentShipment).where(eq(dbTableTreatmentShipment.id, input.id)).returning()
        ).at(0);
        if (!deletedShipment) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Envío al tratamiento con ID ${input.id} no encontrado`,
          });
        }
        return { item: deletedShipment, txid };
      } catch (error) {
        handleMutationError({ error });
      }
    }),
  ),
  deleteReception: procedure.input(requiredIdObjectSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const txid = await generateTxId(tx);
        const deletedReception = (
          await tx.delete(dbTableTreatmentReception).where(eq(dbTableTreatmentReception.id, input.id)).returning()
        ).at(0);
        if (!deletedReception) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Recepción del tratamiento con ID ${input.id} no encontrada`,
          });
        }
        return { item: deletedReception, txid };
      } catch (error) {
        handleMutationError({ error });
      }
    }),
  ),
});
