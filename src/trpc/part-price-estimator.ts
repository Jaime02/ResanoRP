import { dbTablePartPriceEstimator } from "@/db/schema";
import { handleMutationError } from "@/lib/handlers";
import { updatePartPriceEstimatorSchema } from "@/schemas/part-price-estimator";
import { router } from "@/trpc";
import { adminProcedure } from "@/trpc";

export default router({
  update: adminProcedure.input(updatePartPriceEstimatorSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const newPartPriceEstimator = (
          await tx
            .insert(dbTablePartPriceEstimator)
            .values(input)
            .onConflictDoUpdate({
              set: input,
              target: dbTablePartPriceEstimator.partId,
            })
            .returning()
        ).at(0);

        return { item: newPartPriceEstimator };
      } catch (error) {
        handleMutationError({ error });
      }
    }),
  ),
});
