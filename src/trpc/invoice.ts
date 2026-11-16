import fs from "node:fs/promises";
import path from "node:path";

import { TRPCError } from "@trpc/server";
import { and, eq, getTableName, inArray, isNull, sql } from "drizzle-orm";

import { getConfiguration } from "@/db/functions/configuration";
import {
  getDeliveryNotesToInvoice,
  getInvoiceForDocument,
  getInvoicesForAccountingExport,
  sendInvoice,
  unaccountInvoice,
} from "@/db/functions/invoice";
import { dbTableDeliveryNote, dbTableDeliveryNoteLine, dbTableInvoice, dbTableSellOrderLine } from "@/db/schema";
import {
  encodeAccountingExportCsv,
  getAccountingExportCsv,
  hasAmountTooLarge,
  MAX_AMOUNT_IN_CENTS,
} from "@/files/accounting-export";
import { removeOnRollback } from "@/files/functions";
import { getAccountingExportFileName, getAccountingExportPath, printInvoice } from "@/files/invoice";
import { getSalesDocumentLine } from "@/files/sales-document";
import { addAppDays, endOfAppDay, startOfAppDay } from "@/lib/dates";
import { formatDate } from "@/lib/formatters";
import { handleMutationError } from "@/lib/handlers";
import { formatCents, getDeliveryNoteLineUnitPrice, getUnpricedDeliveryNoteIds, getVatBreakdown } from "@/lib/prices";
import {
  INVOICE_NOT_DELETED_NOT_LAST_MESSAGE,
  INVOICE_NOT_DELETED_SENT_MESSAGE,
  INVOICE_NOT_SENT_UNPRICED_MESSAGE,
  INVOICES_NOT_ACCOUNTED_AMOUNT_TOO_LARGE_MESSAGE,
  INVOICES_NOT_ACCOUNTED_UNPRICED_MESSAGE,
  INVOICES_NOT_ACCOUNTED_WITHOUT_ACCOUNT_MESSAGE,
  NO_PENDING_INVOICES_TO_ACCOUNT_MESSAGE,
} from "@/messages/invoice";
import { requiredIdObjectSchema } from "@/schemas";
import { createInvoiceSchema } from "@/schemas/invoice";
import { router } from "@/trpc";
import { adminProcedure } from "@/trpc";

export default router({
  account: adminProcedure.mutation(async ({ ctx }) =>
    removeOnRollback(async (createdPaths) =>
      ctx.db.transaction(async (tx) => {
        try {
          // The Facturas are marked before being read, so an export running at the same time waits for this one
          // and does not export them again
          const accountedInvoiceIds = (
            await tx
              .update(dbTableInvoice)
              .set({ accounted: true })
              .where(eq(dbTableInvoice.accounted, false))
              .returning({ id: dbTableInvoice.id })
          ).map((invoice) => invoice.id);
          if (accountedInvoiceIds.length === 0) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: NO_PENDING_INVOICES_TO_ACCOUNT_MESSAGE,
            });
          }

          const invoices = await getInvoicesForAccountingExport(accountedInvoiceIds, tx);
          const clientNamesWithoutAccount = [
            ...new Set(
              invoices
                .filter((invoice) => invoice.client.prismaAccountingAccountId === null)
                .map((invoice) => invoice.client.name),
            ),
          ];
          if (clientNamesWithoutAccount.length > 0) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: INVOICES_NOT_ACCOUNTED_WITHOUT_ACCOUNT_MESSAGE(clientNamesWithoutAccount),
            });
          }

          // A Línea can lose its price after its Factura was created, and it would be exported at 0 €
          const unpricedDeliveryNoteIds = getUnpricedDeliveryNoteIds(
            invoices.flatMap((invoice) => invoice.deliveryNotes),
          );
          if (unpricedDeliveryNoteIds.length > 0) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: INVOICES_NOT_ACCOUNTED_UNPRICED_MESSAGE(unpricedDeliveryNoteIds),
            });
          }

          const exportInvoices = invoices.map((invoice) => ({
            client: { ...invoice.client, accountingAccountId: invoice.client.prismaAccountingAccountId! },
            createdAt: invoice.createdAt,
            dueDate: invoice.dueDate,
            generatesReceipt: invoice.paymentMethod?.generatesReceipt ?? false,
            id: invoice.id,
            vatBreakdown: getVatBreakdown(
              invoice.deliveryNotes.flatMap((deliveryNote) =>
                deliveryNote.deliveryNoteLines.map((deliveryNoteLine) => ({
                  quantity: deliveryNoteLine.quantity,
                  unitPrice: getDeliveryNoteLineUnitPrice(deliveryNoteLine),
                  vatPercentage: deliveryNoteLine.vatPercentage,
                })),
              ),
            ),
          }));
          const invoiceIdsWithAmountTooLarge = exportInvoices.filter(hasAmountTooLarge).map((invoice) => invoice.id);
          if (invoiceIdsWithAmountTooLarge.length > 0) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: INVOICES_NOT_ACCOUNTED_AMOUNT_TOO_LARGE_MESSAGE(
                formatCents(MAX_AMOUNT_IN_CENTS),
                invoiceIdsWithAmountTooLarge,
              ),
            });
          }

          // Saved before the Facturas are committed as accounted, so the file is not lost when its download fails
          const fileName = getAccountingExportFileName(
            invoices.map((invoice) => invoice.id),
            new Date(),
          );
          const filePath = getAccountingExportPath(fileName);
          await fs.mkdir(path.dirname(filePath), { recursive: true });
          createdPaths.push(filePath);
          await fs.writeFile(filePath, encodeAccountingExportCsv(getAccountingExportCsv(exportInvoices)));

          return { fileName, invoiceIds: accountedInvoiceIds };
        } catch (error) {
          handleMutationError({ error });
        }
      }),
    ),
  ),
  unaccount: adminProcedure.input(requiredIdObjectSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const unaccountedInvoice = await unaccountInvoice(input.id, tx);
        if (!unaccountedInvoice) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Factura contabilizada con ID ${input.id} no encontrada`,
          });
        }
        return { item: unaccountedInvoice };
      } catch (error) {
        handleMutationError({ error });
      }
    }),
  ),
  send: adminProcedure.input(requiredIdObjectSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        // A Línea can lose its price after its Factura was created, and the Cliente would get it at 0 €
        const invoice = await getInvoiceForDocument(input.id, tx);
        const unpricedDeliveryNoteIds = getUnpricedDeliveryNoteIds(invoice?.deliveryNotes ?? []);
        if (unpricedDeliveryNoteIds.length > 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: INVOICE_NOT_SENT_UNPRICED_MESSAGE(unpricedDeliveryNoteIds),
          });
        }
        const sentInvoice = await sendInvoice(input.id, tx);
        if (!sentInvoice) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Factura no enviada con ID ${input.id} no encontrada`,
          });
        }
        return { item: sentInvoice };
      } catch (error) {
        handleMutationError({ error });
      }
    }),
  ),
  create: adminProcedure.input(createInvoiceSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const client = await tx.query.dbTableClient.findFirst({
          where: { id: input.clientId },
          with: { defaultPaymentMethod: true },
        });
        if (!client) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Cliente con ID ${input.clientId} no encontrado`,
          });
        }

        const deliveryNotes = await getDeliveryNotesToInvoice(
          {
            clientId: client.id,
            endDate: input.endDate !== null ? endOfAppDay(input.endDate) : undefined,
            startDate: input.startDate !== null ? startOfAppDay(input.startDate) : undefined,
          },
          tx,
        );
        if (deliveryNotes.length === 0) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `No hay Albaranes del Cliente ${client.name} pendientes de facturar entre las fechas seleccionadas`,
          });
        }

        const unpricedDeliveryNotes = await tx
          .selectDistinct({ id: dbTableDeliveryNoteLine.deliveryNoteId })
          .from(dbTableDeliveryNoteLine)
          .leftJoin(dbTableSellOrderLine, eq(dbTableSellOrderLine.id, dbTableDeliveryNoteLine.sellOrderLineId))
          .where(
            and(
              inArray(
                dbTableDeliveryNoteLine.deliveryNoteId,
                deliveryNotes.map((deliveryNote) => deliveryNote.id),
              ),
              isNull(dbTableDeliveryNoteLine.unitPrice),
              isNull(dbTableSellOrderLine.partPrice),
            ),
          )
          .orderBy(dbTableDeliveryNoteLine.deliveryNoteId);
        if (unpricedDeliveryNotes.length > 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Los Albaranes ${unpricedDeliveryNotes.map((deliveryNote) => deliveryNote.id).join(", ")} tienen Líneas sin precio`,
          });
        }

        const deliveryNoteIds = deliveryNotes.map((deliveryNote) => deliveryNote.id);
        // Claimed before the Factura takes a number, so a conflict does not leave a gap in the numbering
        const claimedDeliveryNotes = await tx
          .select({ id: dbTableDeliveryNote.id })
          .from(dbTableDeliveryNote)
          .where(and(inArray(dbTableDeliveryNote.id, deliveryNoteIds), isNull(dbTableDeliveryNote.invoiceId)))
          .for("update");
        // Another Factura took some of them since they were listed
        if (claimedDeliveryNotes.length !== deliveryNotes.length) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `Los Albaranes del Cliente ${client.name} ya se están facturando, inténtalo de nuevo`,
          });
        }

        const createdAt = new Date();
        const newInvoice = (
          await tx
            .insert(dbTableInvoice)
            .values({
              accounted: false,
              clientId: client.id,
              createdAt,
              dueDate: addAppDays(createdAt, client.defaultPaymentMethod?.paymentDeadlineDays ?? 0),
              paymentMethodId: client.defaultPaymentMethodId,
              sent: false,
            })
            .returning()
        ).at(0);
        if (!newInvoice) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Error al crear la Factura",
          });
        }

        await tx
          .update(dbTableDeliveryNote)
          .set({ invoiceId: newInvoice.id })
          .where(inArray(dbTableDeliveryNote.id, deliveryNoteIds));

        return { item: newInvoice };
      } catch (error) {
        handleMutationError({ error });
      }
    }),
  ),
  delete: adminProcedure.input(requiredIdObjectSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        // Invoice numbers must be consecutive, so creating a Factura waits until the numbering is reset below
        await tx.execute(sql`LOCK TABLE ${dbTableInvoice} IN SHARE ROW EXCLUSIVE MODE`);

        const invoice = await tx.query.dbTableInvoice.findFirst({ where: { id: input.id } });
        // Prisma already has an accounted Factura, so its Albaranes would be invoiced and accounted twice
        if (!invoice || invoice.accounted) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Factura sin contabilizar con ID ${input.id} no encontrada, descontabilízala antes de eliminarla`,
          });
        }
        // The Cliente would keep a Factura that no longer exists
        if (invoice.sent) {
          throw new TRPCError({ code: "BAD_REQUEST", message: INVOICE_NOT_DELETED_SENT_MESSAGE(invoice.id) });
        }
        const lastInvoice = await tx.query.dbTableInvoice.findFirst({ orderBy: { id: "desc" } });
        if (lastInvoice && lastInvoice.id !== invoice.id) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: INVOICE_NOT_DELETED_NOT_LAST_MESSAGE(invoice.id, lastInvoice.id),
          });
        }

        await tx
          .update(dbTableDeliveryNote)
          .set({ invoiceId: null })
          .where(eq(dbTableDeliveryNote.invoiceId, input.id));
        await tx.delete(dbTableInvoice).where(eq(dbTableInvoice.id, input.id));
        // Also gives back the numbers of creations that failed after taking one
        await tx.execute(
          sql`SELECT setval(pg_get_serial_sequence(${getTableName(dbTableInvoice)}, ${dbTableInvoice.id.name}), COALESCE(MAX(${dbTableInvoice.id}), 0) + 1, false) FROM ${dbTableInvoice}`,
        );

        return { item: invoice };
      } catch (error) {
        handleMutationError({ error });
      }
    }),
  ),
  print: adminProcedure.input(requiredIdObjectSchema).mutation(async ({ input }) => {
    const invoice = await getInvoiceForDocument(input.id);
    if (!invoice) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `Factura con ID ${input.id} no encontrada`,
      });
    }

    const configuration = await getConfiguration();
    if (!configuration) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "No se ha configurado los datos de la empresa",
      });
    }

    await printInvoice({
      bankAccount: configuration.bankAccount,
      client: invoice.client,
      company: configuration,
      date: formatDate(invoice.createdAt),
      deliveryNotes: invoice.deliveryNotes.map((deliveryNote) => ({
        deliveryDate: formatDate(deliveryNote.deliveryDate),
        id: deliveryNote.id,
        lines: deliveryNote.deliveryNoteLines.map((deliveryNoteLine) => ({
          ...getSalesDocumentLine(deliveryNoteLine),
          vatPercentage: deliveryNoteLine.vatPercentage,
        })),
      })),
      dueDate: formatDate(invoice.dueDate),
      footnote: configuration.invoiceFootnote,
      invoiceId: invoice.id,
      paymentMethodName: invoice.paymentMethod?.name ?? null,
    });
  }),
});
