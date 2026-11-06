import fs from "node:fs/promises";
import path from "node:path";

import { TRPCError } from "@trpc/server";
import { and, eq, inArray, isNull } from "drizzle-orm";

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
import { getAccountingExportPath, printInvoice } from "@/files/invoice";
import { getSalesDocumentLine } from "@/files/sales-document";
import { addAppDays, endOfAppDay, startOfAppDay } from "@/lib/dates";
import { formatDate } from "@/lib/formatters";
import { handleMutationError } from "@/lib/handlers";
import { formatCents, getDeliveryNoteLineUnitPrice, getUnpricedDeliveryNoteIds, getVatBreakdown } from "@/lib/prices";
import { requiredIdObjectSchema } from "@/schemas";
import { createInvoiceSchema } from "@/schemas/invoice";
import { router, generateTxId } from "@/trpc";
import { adminProcedure } from "@/trpc";

export default router({
  account: adminProcedure.mutation(async ({ ctx }) =>
    removeOnRollback(async (createdPaths) =>
      ctx.db.transaction(async (tx) => {
        try {
          const txid = await generateTxId(tx);

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
              message: "No hay Facturas pendientes de contabilizar",
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
              message: `No se han contabilizado las Facturas porque estos Clientes no tienen cuenta contable de Prisma: ${clientNamesWithoutAccount.join(", ")}`,
            });
          }

          // A Línea can lose its price after its Factura was created, and it would be exported at 0 €
          const unpricedDeliveryNoteIds = getUnpricedDeliveryNoteIds(
            invoices.flatMap((invoice) => invoice.deliveryNotes),
          );
          if (unpricedDeliveryNoteIds.length > 0) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `No se han contabilizado las Facturas porque estos Albaranes tienen Líneas sin precio: ${unpricedDeliveryNoteIds.join(", ")}`,
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
              message: `No se han contabilizado las Facturas porque estas tienen importes mayores de ${formatCents(MAX_AMOUNT_IN_CENTS)}, que no caben en el fichero de Prisma: ${invoiceIdsWithAmountTooLarge.join(", ")}`,
            });
          }

          // Saved before the Facturas are committed as accounted, so the file is not lost when its download fails
          const fileName = `facturas-${invoices[0].id}-${invoices.at(-1)!.id}.csv`;
          const filePath = getAccountingExportPath(fileName);
          await fs.mkdir(path.dirname(filePath), { recursive: true });
          createdPaths.push(filePath);
          await fs.writeFile(filePath, encodeAccountingExportCsv(getAccountingExportCsv(exportInvoices)));

          return { fileName, invoiceIds: accountedInvoiceIds, txid };
        } catch (error) {
          handleMutationError({ error });
        }
      }),
    ),
  ),
  unaccount: adminProcedure.input(requiredIdObjectSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const txid = await generateTxId(tx);
        const unaccountedInvoice = await unaccountInvoice(input.id, tx);
        if (!unaccountedInvoice) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Factura contabilizada con ID ${input.id} no encontrada`,
          });
        }
        return { item: unaccountedInvoice, txid };
      } catch (error) {
        handleMutationError({ error });
      }
    }),
  ),
  send: adminProcedure.input(requiredIdObjectSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const txid = await generateTxId(tx);
        // A Línea can lose its price after its Factura was created, and the Cliente would get it at 0 €
        const invoice = await getInvoiceForDocument(input.id, tx);
        const unpricedDeliveryNoteIds = getUnpricedDeliveryNoteIds(invoice?.deliveryNotes ?? []);
        if (unpricedDeliveryNoteIds.length > 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `No se ha enviado la Factura porque estos Albaranes tienen Líneas sin precio: ${unpricedDeliveryNoteIds.join(", ")}`,
          });
        }
        const sentInvoice = await sendInvoice(input.id, tx);
        if (!sentInvoice) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Factura no enviada con ID ${input.id} no encontrada`,
          });
        }
        return { item: sentInvoice, txid };
      } catch (error) {
        handleMutationError({ error });
      }
    }),
  ),
  create: adminProcedure.input(createInvoiceSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const txid = await generateTxId(tx);

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

        const invoicedDeliveryNotes = await tx
          .update(dbTableDeliveryNote)
          .set({ invoiceId: newInvoice.id })
          .where(
            and(
              inArray(
                dbTableDeliveryNote.id,
                deliveryNotes.map((deliveryNote) => deliveryNote.id),
              ),
              isNull(dbTableDeliveryNote.invoiceId),
            ),
          )
          .returning({ id: dbTableDeliveryNote.id });
        // Another Factura took some of them since they were listed
        if (invoicedDeliveryNotes.length !== deliveryNotes.length) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `Los Albaranes del Cliente ${client.name} ya se están facturando, inténtalo de nuevo`,
          });
        }

        return { item: newInvoice, txid };
      } catch (error) {
        handleMutationError({ error });
      }
    }),
  ),
  delete: adminProcedure.input(requiredIdObjectSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const txid = await generateTxId(tx);

        const releasedDeliveryNotes = await tx
          .update(dbTableDeliveryNote)
          .set({ invoiceId: null })
          .where(eq(dbTableDeliveryNote.invoiceId, input.id))
          .returning({ id: dbTableDeliveryNote.id });

        // Prisma already has an accounted Factura, so its Albaranes would be invoiced and accounted twice
        const deletedInvoice = (
          await tx
            .delete(dbTableInvoice)
            .where(and(eq(dbTableInvoice.id, input.id), eq(dbTableInvoice.accounted, false)))
            .returning()
        ).at(0);
        if (!deletedInvoice) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Factura sin contabilizar con ID ${input.id} no encontrada, descontabilízala antes de eliminarla`,
          });
        }

        return {
          item: deletedInvoice,
          releasedDeliveryNoteIds: releasedDeliveryNotes.map((deliveryNote) => deliveryNote.id),
          txid,
        };
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
