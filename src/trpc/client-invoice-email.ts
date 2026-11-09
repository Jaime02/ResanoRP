import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

import { getClientById } from "@/db/functions/client";
import { CLIENT_INVOICE_EMAIL_CONSTRAINT, dbTableClientInvoiceEmail } from "@/db/schema";
import { handleMutationError } from "@/lib/handlers";
import { CLIENT_INVOICE_EMAIL_DELETED_CLIENT_MESSAGE, CLIENT_INVOICE_EMAIL_TAKEN_MESSAGE } from "@/messages/client";
import { requiredIdObjectSchema } from "@/schemas";
import { createClientInvoiceEmailSchema } from "@/schemas/client-invoice-email";
import { router, generateTxId } from "@/trpc";
import { adminProcedure } from "@/trpc";

const uniqueConstraints = [
  {
    constraintName: CLIENT_INVOICE_EMAIL_CONSTRAINT,
    errorMessage: CLIENT_INVOICE_EMAIL_TAKEN_MESSAGE,
  },
];

export default router({
  create: adminProcedure.input(createClientInvoiceEmailSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const txid = await generateTxId(tx);
        const client = await getClientById(input.clientId, tx);
        if (!client) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Cliente con ID ${input.clientId} no encontrado`,
          });
        }
        if (client.deletedAt !== null) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: CLIENT_INVOICE_EMAIL_DELETED_CLIENT_MESSAGE,
          });
        }
        const newEmail = (await tx.insert(dbTableClientInvoiceEmail).values(input).returning()).at(0);
        if (!newEmail) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Error al crear el correo de facturación",
          });
        }
        return { item: newEmail, txid };
      } catch (error) {
        handleMutationError({ error, uniqueConstraints });
      }
    }),
  ),
  delete: adminProcedure.input(requiredIdObjectSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const txid = await generateTxId(tx);
        const deletedClientInvoiceEmail = (
          await tx.delete(dbTableClientInvoiceEmail).where(eq(dbTableClientInvoiceEmail.id, input.id)).returning()
        ).at(0);
        if (!deletedClientInvoiceEmail) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Correo de facturación con ID ${input.id} no encontrado`,
          });
        }
        return { item: deletedClientInvoiceEmail, txid };
      } catch (error) {
        handleMutationError({ error });
      }
    }),
  ),
});
