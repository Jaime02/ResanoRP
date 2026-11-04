import { TRPCError } from "@trpc/server";
import { and, eq, isNotNull } from "drizzle-orm";

import { CLIENT_NAME_CONSTRAINT, dbTableClient, dbTableClientInvoiceEmail } from "@/db/schema";
import { createClientFolder } from "@/files/sell-order";
import { handleMutationError } from "@/lib/handlers";
import { requiredIdObjectSchema } from "@/schemas";
import { createClientSchema, updateClientSchema } from "@/schemas/client";
import { router, generateTxId } from "@/trpc";
import { adminProcedure } from "@/trpc";

const uniqueConstraints = [
  {
    constraintName: CLIENT_NAME_CONSTRAINT,
    errorMessage: "Existe un Cliente con el mismo nombre",
  },
];

export default router({
  create: adminProcedure.input(createClientSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const txid = await generateTxId(tx);
        const newClient = (await tx.insert(dbTableClient).values(input).returning()).at(0);
        if (!newClient) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Error al crear el Cliente",
          });
        }
        createClientFolder(newClient);

        return { item: newClient, txid };
      } catch (error) {
        handleMutationError({ error, uniqueConstraints });
      }
    }),
  ),
  update: adminProcedure.input(updateClientSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const txid = await generateTxId(tx);
        const updatedClient = (
          await tx.update(dbTableClient).set(input).where(eq(dbTableClient.id, input.id)).returning()
        ).at(0);
        if (!updatedClient) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Cliente con ID ${input.id} no encontrado`,
          });
        }
        return { item: updatedClient, txid };
      } catch (error) {
        handleMutationError({ error, uniqueConstraints });
      }
    }),
  ),
  delete: adminProcedure.input(requiredIdObjectSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const txid = await generateTxId(tx);
        const deletedClient = (
          await tx
            .update(dbTableClient)
            .set({ deletedAt: new Date() })
            .where(eq(dbTableClient.id, input.id))
            .returning()
        ).at(0);
        if (!deletedClient) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Cliente con ID ${input.id} no encontrado`,
          });
        }
        const deletedClientInvoiceEmails = await tx
          .delete(dbTableClientInvoiceEmail)
          .where(eq(dbTableClientInvoiceEmail.clientId, input.id))
          .returning({ id: dbTableClientInvoiceEmail.id });
        return {
          item: deletedClient,
          txid,
          deletedClientInvoiceEmailIds: deletedClientInvoiceEmails.map((clientInvoiceEmail) => clientInvoiceEmail.id),
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
        const restoredClient = (
          await tx
            .update(dbTableClient)
            .set({ deletedAt: null })
            .where(and(eq(dbTableClient.id, input.id), isNotNull(dbTableClient.deletedAt)))
            .returning()
        ).at(0);
        if (!restoredClient) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Cliente con ID ${input.id} no encontrado o no eliminado`,
          });
        }
        return { item: restoredClient, txid };
      } catch (error) {
        handleMutationError({ error, uniqueConstraints });
      }
    }),
  ),
});
