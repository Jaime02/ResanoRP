import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";

import { getMachineById } from "@/db/functions/machine";
import { dbGetProductionOrderStatus, getProductionOrderById } from "@/db/functions/production-order";
import {
  MACHINE_PRODUCTION_ORDER_QUEUE_CONSTRAINT,
  dbTableMachine,
  dbTableMachineProductionOrderQueue,
} from "@/db/schema";
import { handleMutationError } from "@/lib/handlers";
import { translatedEnums } from "@/lib/translations";
import { PRODUCTION_ORDER_NOT_ASSIGNABLE_MESSAGE } from "@/messages/production-order";
import {
  addProductionOrderToMachineQueueSchema,
  moveProductionOrderToMachineQueueStartSchema,
  removeProductionOrderFromMachineQueueSchema,
} from "@/schemas/machine-production-order-queue";
import { ProductionOrderStatus } from "@/schemas/production-order";
import { router } from "@/trpc";
import { procedure } from "@/trpc";

const uniqueConstraints = [
  {
    constraintName: MACHINE_PRODUCTION_ORDER_QUEUE_CONSTRAINT,
    errorMessage: "La Máquina ya tiene esa Orden de producción en la cola",
  },
];

export default router({
  create: procedure.input(addProductionOrderToMachineQueueSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const machine = await getMachineById(input.machineId, tx);
        if (!machine) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "La Máquina no existe",
          });
        }

        const productionOrder = await getProductionOrderById(input.productionOrderId, tx);
        if (!productionOrder) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Orden de producción con ID ${input.productionOrderId} no encontrada`,
          });
        }
        const productionOrderStatus = await dbGetProductionOrderStatus(productionOrder, tx);
        if (![ProductionOrderStatus.Pending, ProductionOrderStatus.InProduction].includes(productionOrderStatus)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: PRODUCTION_ORDER_NOT_ASSIGNABLE_MESSAGE(
              input.productionOrderId,
              translatedEnums.ProductionOrderStatus[productionOrderStatus],
            ),
          });
        }

        const productionOrderQueueEntry = (
          await tx
            .insert(dbTableMachineProductionOrderQueue)
            .values({
              machineId: input.machineId,
              productionOrderId: input.productionOrderId,
              timestamp: new Date(),
            })
            .returning()
        ).at(0);
        if (productionOrderQueueEntry === undefined) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Error al añadir la Orden de producción a la cola de la Máquina",
          });
        }
        return { item: productionOrderQueueEntry };
      } catch (error) {
        handleMutationError({ error, uniqueConstraints });
      }
    }),
  ),
  moveProductionOrderToMachineQueueStart: procedure
    .input(moveProductionOrderToMachineQueueStartSchema)
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        try {
          const machine = await getMachineById(input.machineId, tx);
          if (!machine) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "La Máquina no existe",
            });
          }

          const updatedMachineProductionOrder = (
            await tx
              .update(dbTableMachineProductionOrderQueue)
              .set({
                timestamp: new Date(),
              })
              .where(
                and(
                  eq(dbTableMachineProductionOrderQueue.productionOrderId, input.productionOrderId),
                  eq(dbTableMachineProductionOrderQueue.machineId, input.machineId),
                ),
              )
              .returning()
          ).at(0);
          if (updatedMachineProductionOrder === undefined) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "La Orden de producción no existe en la cola de la Máquina",
            });
          }
          return { item: updatedMachineProductionOrder };
        } catch (error) {
          handleMutationError({ error });
        }
      }),
    ),
  delete: procedure.input(removeProductionOrderFromMachineQueueSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const machine = await getMachineById(input.machineId, tx);
        if (machine === undefined) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "La Máquina no existe",
          });
        }

        const deletedMachineProductionOrder = (
          await tx
            .delete(dbTableMachineProductionOrderQueue)
            .where(
              and(
                eq(dbTableMachineProductionOrderQueue.productionOrderId, input.productionOrderId),
                eq(dbTableMachineProductionOrderQueue.machineId, input.machineId),
              ),
            )
            .returning()
        ).at(0);
        if (deletedMachineProductionOrder === undefined) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "La Orden de producción no existe en la cola de la Máquina",
          });
        }

        if (machine.activeProductionOrderId === input.productionOrderId) {
          await tx
            .update(dbTableMachine)
            .set({ activeProductionOrderId: null })
            .where(eq(dbTableMachine.id, input.machineId));
        }

        return { item: deletedMachineProductionOrder };
      } catch (error) {
        handleMutationError({ error });
      }
    }),
  ),
});
