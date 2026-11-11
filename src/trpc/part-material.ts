import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";

import { getPartById } from "@/db/functions/part";
import { PART_MATERIAL_CONSTRAINT, dbTablePartMaterial } from "@/db/schema";
import { handleMutationError } from "@/lib/handlers";
import { partMaterialSchema } from "@/schemas/part-material";
import { router } from "@/trpc";
import { adminProcedure } from "@/trpc";

const uniqueConstraints = [
  {
    constraintName: PART_MATERIAL_CONSTRAINT,
    errorMessage: "El Artículo ya utiliza ese Material",
  },
];

export default router({
  addMaterialToPart: adminProcedure.input(partMaterialSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const newPartMaterial = (await tx.insert(dbTablePartMaterial).values(input).returning()).at(0);
        return { item: newPartMaterial };
      } catch (error) {
        handleMutationError({ error, uniqueConstraints });
      }
    }),
  ),
  deleteMaterialFromPart: adminProcedure.input(partMaterialSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const deletedPartMaterial = (
          await tx
            .delete(dbTablePartMaterial)
            .where(
              and(eq(dbTablePartMaterial.partId, input.partId), eq(dbTablePartMaterial.materialId, input.materialId)),
            )
            .returning()
        ).at(0);
        const updatedPart = await getPartById(input.partId, tx);
        if (!updatedPart) {
          throw new TRPCError({ code: "NOT_FOUND", message: `El Artículo con ID ${input.partId} no existe` });
        }
        if (!deletedPartMaterial) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `El Artículo "${updatedPart.description}" no utiliza el Material ${input.materialId}`,
          });
        }
        return { item: deletedPartMaterial };
      } catch (error) {
        handleMutationError({ error });
      }
    }),
  ),
});
