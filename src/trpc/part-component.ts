import { TRPCError } from "@trpc/server";
import { and, eq, sql } from "drizzle-orm";

import { getPartById, isPartInComponentTree } from "@/db/functions/part";
import { PART_COMPONENT_CONSTRAINT, dbTablePartComponent } from "@/db/schema";
import { handleMutationError } from "@/lib/handlers";
import {
  PART_COMPONENT_CYCLE_ERROR_MESSAGE,
  PART_COMPONENT_DELETED_ERROR_MESSAGE,
  PART_COMPONENT_DUPLICATED_ERROR_MESSAGE,
  PART_COMPONENT_SELF_ERROR_MESSAGE,
  PART_SET_DELETED_ERROR_MESSAGE,
} from "@/messages/part";
import { partComponentKeySchema, partComponentSchema } from "@/schemas/part-component";
import type { TPartComponent } from "@/schemas/part-component";
import { router, generateTxId } from "@/trpc";
import { adminProcedure } from "@/trpc";

const PART_COMPONENT_LOCK_KEY = 4_242_001;

const uniqueConstraints = [
  {
    constraintName: PART_COMPONENT_CONSTRAINT,
    errorMessage: PART_COMPONENT_DUPLICATED_ERROR_MESSAGE,
  },
];

function wherePartComponent({ parentPartId, componentPartId }: Omit<TPartComponent, "quantity">) {
  return and(
    eq(dbTablePartComponent.parentPartId, parentPartId),
    eq(dbTablePartComponent.componentPartId, componentPartId),
  );
}

export default router({
  create: adminProcedure.input(partComponentSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const txid = await generateTxId(tx);
        // Two concurrent inserts (A in B, B in A) would each pass the cycle check on their own snapshot
        await tx.execute(sql`SELECT pg_advisory_xact_lock(${PART_COMPONENT_LOCK_KEY})`);
        const [parentPart, componentPart] = await Promise.all([
          getPartById(input.parentPartId, tx),
          getPartById(input.componentPartId, tx),
        ]);
        if (!parentPart || parentPart.deletedAt !== null) {
          throw new TRPCError({ code: "BAD_REQUEST", message: PART_SET_DELETED_ERROR_MESSAGE });
        }
        if (!componentPart || componentPart.deletedAt !== null) {
          throw new TRPCError({ code: "BAD_REQUEST", message: PART_COMPONENT_DELETED_ERROR_MESSAGE });
        }
        if (input.parentPartId === input.componentPartId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: PART_COMPONENT_SELF_ERROR_MESSAGE });
        }
        if (await isPartInComponentTree({ partId: input.parentPartId, rootPartId: input.componentPartId }, tx)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: PART_COMPONENT_CYCLE_ERROR_MESSAGE });
        }
        const newPartComponent = (await tx.insert(dbTablePartComponent).values(input).returning()).at(0);
        return { item: newPartComponent, txid };
      } catch (error) {
        handleMutationError({ error, uniqueConstraints });
      }
    }),
  ),
  update: adminProcedure.input(partComponentSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const txid = await generateTxId(tx);
        const updatedPartComponent = (
          await tx
            .update(dbTablePartComponent)
            .set({ quantity: input.quantity })
            .where(wherePartComponent(input))
            .returning()
        ).at(0);
        if (!updatedPartComponent) {
          throw new TRPCError({ code: "NOT_FOUND", message: "El Conjunto no contiene ese Artículo" });
        }
        return { item: updatedPartComponent, txid };
      } catch (error) {
        handleMutationError({ error });
      }
    }),
  ),
  delete: adminProcedure.input(partComponentKeySchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const txid = await generateTxId(tx);
        const deletedPartComponent = (
          await tx.delete(dbTablePartComponent).where(wherePartComponent(input)).returning()
        ).at(0);
        if (!deletedPartComponent) {
          throw new TRPCError({ code: "NOT_FOUND", message: "El Conjunto no contiene ese Artículo" });
        }
        return { item: deletedPartComponent, txid };
      } catch (error) {
        handleMutationError({ error });
      }
    }),
  ),
});
