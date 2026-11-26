import fs from "node:fs/promises";
import path from "node:path";

import { TRPCError } from "@trpc/server";
import { eq, sql } from "drizzle-orm";

import type { TDatabase } from "@/db";
import { dbTableMaterialLot, dbTableMaterialLotMovement } from "@/db/schema";
import { removeOnRollback, saveUpload } from "@/files/functions";
import { getMaterialCertificatePath } from "@/files/material-certificate";
import { handleMutationError } from "@/lib/handlers";
import {
  MATERIAL_LOT_RECEIVED_BELOW_TAKEN_MESSAGE,
  MATERIAL_LOT_NOT_FOUND_MESSAGE,
  MATERIAL_LOT_STOCK_EXCEEDED_MESSAGE,
  MATERIAL_LOT_UNIT_WITH_MOVEMENTS_MESSAGE,
  MATERIAL_LOT_WITH_MOVEMENTS_MESSAGE,
  MATERIAL_LOT_WITHOUT_STOCK_MESSAGE,
} from "@/messages/material-lot";
import { requiredIdObjectSchema } from "@/schemas";
import {
  createMaterialLotFormDataSchema,
  createMaterialLotMovementSchema,
  updateMaterialLotFormDataSchema,
} from "@/schemas/material-lot";
import { adminProcedure, procedure, router } from "@/trpc";

// Locked, so two movements of the same Lote at once cannot both pass the stock check
async function getLockedMaterialLot(materialLotId: number, tx: TDatabase) {
  const materialLot = (
    await tx.select().from(dbTableMaterialLot).where(eq(dbTableMaterialLot.id, materialLotId)).for("update")
  ).at(0);
  if (!materialLot) {
    throw new TRPCError({ code: "NOT_FOUND", message: MATERIAL_LOT_NOT_FOUND_MESSAGE(materialLotId) });
  }
  return materialLot;
}

async function getMovedQuantity(materialLotId: number, tx: TDatabase) {
  const [moved] = await tx
    .select({ quantity: sql<number>`coalesce(sum(${dbTableMaterialLotMovement.quantity}), 0)`.mapWith(Number) })
    .from(dbTableMaterialLotMovement)
    .where(eq(dbTableMaterialLotMovement.materialLotId, materialLotId));
  return moved.quantity;
}

async function hasMovements(materialLotId: number, tx: TDatabase) {
  return (await tx.query.dbTableMaterialLotMovement.findFirst({ where: { materialLotId } })) !== undefined;
}

async function saveCertificate(materialLotId: number, certificate: File) {
  const filePath = getMaterialCertificatePath(materialLotId);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await saveUpload({ fileUpload: certificate, location: filePath });
  return filePath;
}

export default router({
  create: adminProcedure
    .meta({ writes: [dbTableMaterialLot] })
    .input(createMaterialLotFormDataSchema)
    .mutation(async ({ ctx, input: { certificate, ...input } }) =>
      removeOnRollback(async (createdPaths) =>
        ctx.db.transaction(async (tx) => {
          try {
            const newMaterialLot = (
              await tx
                .insert(dbTableMaterialLot)
                .values({ ...input, hasCertificate: certificate != null })
                .returning()
            ).at(0);
            if (!newMaterialLot) {
              throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Error al crear el Lote" });
            }
            if (certificate != null) {
              createdPaths.push(await saveCertificate(newMaterialLot.id, certificate));
            }
            return { item: newMaterialLot };
          } catch (error) {
            handleMutationError({ error });
          }
        }),
      ),
    ),
  update: adminProcedure
    .meta({ writes: [dbTableMaterialLot] })
    .input(updateMaterialLotFormDataSchema)
    .mutation(async ({ ctx, input: { certificate, id, ...input } }) =>
      ctx.db.transaction(async (tx) => {
        try {
          const materialLot = await getLockedMaterialLot(id, tx);
          // The movements are counted in the unit of their Lote, so changing it would change what they took
          if (input.unit !== materialLot.unit && (await hasMovements(id, tx))) {
            throw new TRPCError({ code: "BAD_REQUEST", message: MATERIAL_LOT_UNIT_WITH_MOVEMENTS_MESSAGE });
          }
          const movedQuantity = await getMovedQuantity(id, tx);
          if (input.receivedQuantity + movedQuantity < 0) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: MATERIAL_LOT_RECEIVED_BELOW_TAKEN_MESSAGE(-movedQuantity),
            });
          }

          const updatedMaterialLot = (
            await tx
              .update(dbTableMaterialLot)
              .set({ ...input, hasCertificate: materialLot.hasCertificate || certificate != null })
              .where(eq(dbTableMaterialLot.id, id))
              .returning()
          ).at(0);
          if (!updatedMaterialLot) {
            throw new TRPCError({ code: "NOT_FOUND", message: MATERIAL_LOT_NOT_FOUND_MESSAGE(id) });
          }
          // Last, as it replaces the previous certificate, which a rollback could not bring back
          if (certificate != null) {
            await saveCertificate(id, certificate);
          }
          return { item: updatedMaterialLot };
        } catch (error) {
          handleMutationError({ error });
        }
      }),
    ),
  delete: adminProcedure
    .meta({ writes: [dbTableMaterialLot] })
    .input(requiredIdObjectSchema)
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        try {
          if (await hasMovements(input.id, tx)) {
            throw new TRPCError({ code: "BAD_REQUEST", message: MATERIAL_LOT_WITH_MOVEMENTS_MESSAGE });
          }
          const deletedMaterialLot = (
            await tx.delete(dbTableMaterialLot).where(eq(dbTableMaterialLot.id, input.id)).returning()
          ).at(0);
          if (!deletedMaterialLot) {
            throw new TRPCError({ code: "NOT_FOUND", message: MATERIAL_LOT_NOT_FOUND_MESSAGE(input.id) });
          }
          if (deletedMaterialLot.hasCertificate) {
            await fs.rm(getMaterialCertificatePath(deletedMaterialLot.id), { force: true });
          }
          return { item: deletedMaterialLot };
        } catch (error) {
          handleMutationError({ error });
        }
      }),
    ),
  move: procedure
    .meta({ writes: [dbTableMaterialLotMovement] })
    .input(createMaterialLotMovementSchema)
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        try {
          const materialLot = await getLockedMaterialLot(input.materialLotId, tx);
          const remaining = materialLot.receivedQuantity + (await getMovedQuantity(materialLot.id, tx));
          if (input.quantity <= 0 && remaining === 0) {
            throw new TRPCError({ code: "BAD_REQUEST", message: MATERIAL_LOT_WITHOUT_STOCK_MESSAGE });
          }
          const newRemaining = remaining + input.quantity;
          if (newRemaining < 0) {
            throw new TRPCError({ code: "BAD_REQUEST", message: MATERIAL_LOT_STOCK_EXCEEDED_MESSAGE(remaining) });
          }
          if (input.productionOrderId !== null) {
            const productionOrder = await tx.query.dbTableProductionOrder.findFirst({
              where: { id: input.productionOrderId },
            });
            if (!productionOrder) {
              throw new TRPCError({
                code: "NOT_FOUND",
                message: `Orden de producción con ID ${input.productionOrderId} no encontrada`,
              });
            }
          }
          // Any movement of the Lote for the order already records that the order used its Colada
          if (input.quantity === 0 && input.productionOrderId !== null) {
            const existingMovement = await tx.query.dbTableMaterialLotMovement.findFirst({
              where: { materialLotId: input.materialLotId, productionOrderId: input.productionOrderId },
            });
            if (existingMovement) {
              return { item: existingMovement };
            }
          }

          const newMovement = (
            await tx
              .insert(dbTableMaterialLotMovement)
              .values({ ...input, date: new Date() })
              .returning()
          ).at(0);
          if (!newMovement) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Error al registrar el movimiento del Lote",
            });
          }
          return { item: newMovement };
        } catch (error) {
          handleMutationError({ error });
        }
      }),
    ),
});
