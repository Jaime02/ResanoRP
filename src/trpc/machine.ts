import { TRPCError } from "@trpc/server";
import { and, eq, isNotNull, notExists } from "drizzle-orm";

import { getMachineById } from "@/db/functions/machine";
import { dbGetProductionOrderStatus, getProductionOrderById } from "@/db/functions/production-order";
import {
  MACHINE_NAME_CONSTRAINT,
  dbTableMachine,
  dbTableMachineProductionOrderQueue,
  dbTablePartProduction,
  dbTableProductionOrder,
} from "@/db/schema";
import { handleMutationError } from "@/lib/handlers";
import { isProductionFinished } from "@/lib/production-order";
import { requiredIdObjectSchema } from "@/schemas";
import { createMachineSchema, updateMachineSchema } from "@/schemas/machine";
import { updateMachineProductionOrderSchema } from "@/schemas/machine-production-order";
import { stopMachineProductionOrderSchema } from "@/schemas/machine-production-order";
import { updateMachineActiveProductionOrderSchema } from "@/schemas/production-order";
import { router, generateTxId } from "@/trpc";
import { adminProcedure, procedure } from "@/trpc";

const uniqueConstraints = [
  {
    constraintName: MACHINE_NAME_CONSTRAINT,
    errorMessage: "Existe una Máquina con el mismo nombre",
  },
];

export default router({
  create: adminProcedure.input(createMachineSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const txid = await generateTxId(tx);
        const newMachine = (await tx.insert(dbTableMachine).values(input).returning()).at(0);
        if (!newMachine) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Error al crear la Máquina",
          });
        }
        return { item: newMachine, txid };
      } catch (error) {
        handleMutationError({ error, uniqueConstraints });
      }
    }),
  ),
  update: adminProcedure.input(updateMachineSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const txid = await generateTxId(tx);
        const updatedMachine = (
          await tx.update(dbTableMachine).set(input).where(eq(dbTableMachine.id, input.id)).returning()
        ).at(0);
        if (!updatedMachine) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Máquina con ID ${input.id} no encontrada`,
          });
        }
        return { item: updatedMachine, txid };
      } catch (error) {
        handleMutationError({ error, uniqueConstraints });
      }
    }),
  ),
  delete: adminProcedure.input(requiredIdObjectSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const txid = await generateTxId(tx);
        // The active Production Order always belongs to the queue, so it is cleared along with the queue
        const deletedMachine = (
          await tx
            .update(dbTableMachine)
            .set({ activeProductionOrderId: null, deletedAt: new Date() })
            .where(eq(dbTableMachine.id, input.id))
            .returning()
        ).at(0);
        if (!deletedMachine) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Máquina con ID ${input.id} no encontrada`,
          });
        }
        const removedQueueRows = await tx
          .delete(dbTableMachineProductionOrderQueue)
          .where(eq(dbTableMachineProductionOrderQueue.machineId, input.id))
          .returning();
        return { item: deletedMachine, txid, removedFromQueue: removedQueueRows.length > 0 };
      } catch (error) {
        handleMutationError({ error });
      }
    }),
  ),
  restore: adminProcedure.input(requiredIdObjectSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const txid = await generateTxId(tx);
        const restoredMachine = (
          await tx
            .update(dbTableMachine)
            .set({ deletedAt: null })
            .where(and(eq(dbTableMachine.id, input.id), isNotNull(dbTableMachine.deletedAt)))
            .returning()
        ).at(0);
        if (!restoredMachine) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Máquina con ID ${input.id} no encontrada o no eliminada`,
          });
        }
        return { item: restoredMachine, txid };
      } catch (error) {
        handleMutationError({ error, uniqueConstraints });
      }
    }),
  ),
  stopProductionOrder: procedure.input(stopMachineProductionOrderSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const txid = await generateTxId(tx);
        // Locked, so a second stop at the same time waits and then finds the Máquina already stopped
        const machine = (
          await tx.select().from(dbTableMachine).where(eq(dbTableMachine.id, input.machineId)).for("update")
        ).at(0);
        if (machine === undefined) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Máquina con ID ${input.machineId} no encontrada`,
          });
        }

        const { activeProductionOrderId } = machine;
        if (activeProductionOrderId === null) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `La máquina "${machine.name}" no tiene una orden de producción activa`,
          });
        }
        const activeProductionOrder = await tx.query.dbTableProductionOrder.findFirst({
          where: { id: activeProductionOrderId },
        });
        if (activeProductionOrder === undefined) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Orden de producción con ID ${activeProductionOrderId} no encontrada`,
          });
        }

        const activePart = await tx.query.dbTablePart.findFirst({
          where: { id: activeProductionOrder.partId },
        });
        if (activePart === undefined) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Artículo con ID ${activeProductionOrder.partId} no encontrado`,
          });
        }

        if (input.producedQuantity !== null && input.producedQuantity > 0) {
          await tx.insert(dbTablePartProduction).values({
            date: new Date(),
            machineId: input.machineId,
            productionOrderId: activeProductionOrderId,
            quantity: input.producedQuantity,
          });
        }

        await tx
          .update(dbTableMachine)
          .set({ activeProductionOrderId: null })
          .where(eq(dbTableMachine.id, input.machineId));

        // Machines still running a produced order keep it queued so their production can still be reported
        const removedQueueRows = isProductionFinished(await dbGetProductionOrderStatus(activeProductionOrder, tx))
          ? await tx
              .delete(dbTableMachineProductionOrderQueue)
              .where(
                and(
                  eq(dbTableMachineProductionOrderQueue.productionOrderId, activeProductionOrderId),
                  notExists(
                    tx
                      .select()
                      .from(dbTableMachine)
                      .where(
                        and(
                          eq(dbTableMachine.id, dbTableMachineProductionOrderQueue.machineId),
                          eq(dbTableMachine.activeProductionOrderId, activeProductionOrderId),
                        ),
                      ),
                  ),
                ),
              )
              .returning()
          : [];

        return { txid, removedFromQueue: removedQueueRows.length > 0 };
      } catch (error) {
        handleMutationError({ error });
      }
    }),
  ),
  updateActiveProductionOrder: procedure
    .input(updateMachineActiveProductionOrderSchema)
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        try {
          const txid = await generateTxId(tx);

          if (input.productionOrderId !== null) {
            if (!(await getProductionOrderById(input.productionOrderId, tx))) {
              throw new TRPCError({
                code: "NOT_FOUND",
                message: `Orden de producción con ID ${input.productionOrderId} no encontrada`,
              });
            }
          }

          const machine = await getMachineById(input.machineId, tx);
          if (!machine) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: `Máquina con ID ${input.machineId} no encontrada`,
            });
          }

          if (input.productionOrderId !== null) {
            const updatedQueueRows = await tx
              .update(dbTableMachineProductionOrderQueue)
              .set({
                timestamp: new Date(),
              })
              .where(
                and(
                  eq(dbTableMachineProductionOrderQueue.machineId, input.machineId),
                  eq(dbTableMachineProductionOrderQueue.productionOrderId, input.productionOrderId),
                ),
              )
              .returning();
            // The machine filter of the Órdenes de producción only looks at the queue
            if (updatedQueueRows.length === 0) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: `La Orden de producción ${input.productionOrderId} no está en la cola de la Máquina "${machine.name}"`,
              });
            }
          }

          await tx
            .update(dbTableMachine)
            .set({
              activeProductionOrderId: input.productionOrderId,
            })
            .where(eq(dbTableMachine.id, input.machineId));
          return { txid };
        } catch (error) {
          handleMutationError({ error });
        }
      }),
    ),
  updateMachineProductionOrder: procedure.input(updateMachineProductionOrderSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const txid = await generateTxId(tx);

        const updatedProductionOrder = (
          await tx
            .update(dbTableProductionOrder)
            .set(input)
            .where(eq(dbTableProductionOrder.id, input.productionOrderId))
            .returning()
        ).at(0);

        if (!updatedProductionOrder) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Orden de producción con ID ${input.productionOrderId} no encontrada`,
          });
        }

        return { item: updatedProductionOrder, txid };
      } catch (error) {
        handleMutationError({ error });
      }
    }),
  ),
});
