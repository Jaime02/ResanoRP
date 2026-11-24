import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

import { USER_IP_CONSTRAINT, dbTableUser } from "@/db/schema";
import { handleMutationError } from "@/lib/handlers";
import { USER_IP_TAKEN_MESSAGE, USER_NOT_FOUND_MESSAGE } from "@/messages/backoffice";
import { requiredIdObjectSchema } from "@/schemas";
import { createUserSchema, updateUserSchema } from "@/schemas/user";
import { adminProcedure, router } from "@/trpc";

const uniqueConstraints = [{ constraintName: USER_IP_CONSTRAINT, errorMessage: USER_IP_TAKEN_MESSAGE }];

export default router({
  create: adminProcedure.input(createUserSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const newUser = (await tx.insert(dbTableUser).values(input).returning()).at(0);
        if (!newUser) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Error al crear el Usuario" });
        }
        return { item: newUser };
      } catch (error) {
        handleMutationError({ error, uniqueConstraints });
      }
    }),
  ),
  update: adminProcedure.input(updateUserSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const updatedUser = (
          await tx.update(dbTableUser).set(input).where(eq(dbTableUser.id, input.id)).returning()
        ).at(0);
        if (!updatedUser) {
          throw new TRPCError({ code: "NOT_FOUND", message: USER_NOT_FOUND_MESSAGE(input.id) });
        }
        return { item: updatedUser };
      } catch (error) {
        handleMutationError({ error, uniqueConstraints });
      }
    }),
  ),
  delete: adminProcedure.input(requiredIdObjectSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const deletedUser = (await tx.delete(dbTableUser).where(eq(dbTableUser.id, input.id)).returning()).at(0);
        if (!deletedUser) {
          throw new TRPCError({ code: "NOT_FOUND", message: USER_NOT_FOUND_MESSAGE(input.id) });
        }
        return { item: deletedUser };
      } catch (error) {
        handleMutationError({ error });
      }
    }),
  ),
});
