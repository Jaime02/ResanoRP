import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

import type { TDatabase } from "@/db";
import { getProductionOrderById } from "@/db/functions/production-order";
import { dbTablePartFeature, dbTableQualityCheck } from "@/db/schema";
import { handleMutationError } from "@/lib/handlers";
import { isWithinPartFeatureRange } from "@/schemas/part-feature";
import { createQualityCheckSchema } from "@/schemas/quality-check";
import { procedure, router } from "@/trpc";

async function getQualityControlProductionOrder(productionOrderId: number, tx: TDatabase) {
  const productionOrder = await getProductionOrderById(productionOrderId, tx);
  if (!productionOrder) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `Orden de producción con ID ${productionOrderId} no encontrada`,
    });
  }
  if (productionOrder.deletedAt !== null) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `La Orden de producción ${productionOrder.id} está eliminada`,
    });
  }
  if (!productionOrder.qualityControl) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `La Orden de producción ${productionOrder.id} no tiene Control de calidad`,
    });
  }
  return productionOrder;
}

export default router({
  create: procedure.input(createQualityCheckSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const productionOrder = await getQualityControlProductionOrder(input.productionOrderId, tx);
        const partFeatures = await tx
          .select()
          .from(dbTablePartFeature)
          .where(eq(dbTablePartFeature.partId, productionOrder.partId));
        const resultsByFeatureId = new Map(input.results.map((result) => [result.partFeatureId, result]));
        if (
          resultsByFeatureId.size !== input.results.length ||
          resultsByFeatureId.size !== partFeatures.length ||
          partFeatures.some(({ id }) => !resultsByFeatureId.has(id))
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "El Control de calidad debe revisar cada Característica del Artículo una vez",
          });
        }

        const checkedAt = new Date();
        const qualityChecks = await tx
          .insert(dbTableQualityCheck)
          .values(
            partFeatures.map((partFeature) => {
              const result = resultsByFeatureId.get(partFeature.id)!;
              const base = {
                checkedAt,
                notes: result.notes,
                partFeatureId: partFeature.id,
                producedQuantity: input.producedQuantity,
              };
              if (partFeature.minValue === null && partFeature.maxValue === null) {
                return { ...base, ok: result.ok, productionOrderId: productionOrder.id };
              }
              if (result.value === null) {
                return {
                  ...base,
                  ok: true,
                  productionOrderId: productionOrder.id,
                  value: partFeature.maxValue ?? partFeature.minValue,
                };
              }
              return {
                ...base,
                ok: isWithinPartFeatureRange(result.value, partFeature),
                productionOrderId: productionOrder.id,
                value: result.value,
              };
            }),
          )
          .returning();
        return { item: { qualityChecks } };
      } catch (error) {
        handleMutationError({ error });
      }
    }),
  ),
});
