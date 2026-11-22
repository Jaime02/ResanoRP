import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import type { z } from "zod";

import type { TDatabase } from "@/db";
import { dbTablePrinter } from "@/db/schema";
import { pingPrinter, printPdfOnPrinter } from "@/files/printer";
import { handleMutationError } from "@/lib/handlers";
import logger from "@/logging/logger";
import { LogMessages } from "@/logging/types";
import {
  PRINTER_FILE_UNAVAILABLE_MESSAGE,
  PRINTER_NOT_FOUND_MESSAGE,
  PRINTER_NOT_RESPONDING_MESSAGE,
  PRINTER_UNREACHABLE_MESSAGE,
} from "@/messages/printer";
import { requiredIdObjectSchema } from "@/schemas";
import { createPrinterSchema, printFileSchema, updatePrinterSchema } from "@/schemas/printer";
import { adminProcedure, procedure, router } from "@/trpc";
import { isLabelPrinterKind, isSharePrinterKind } from "@/types/printer";

// The documents are served by the app itself, so the server reads the file it previews the same way a browser does
const APP_URL = `http://localhost:${process.env.PORT ?? "5173"}`;

// Every column but the password, which never leaves the server
const PUBLIC_PRINTER_COLUMNS = {
  address: dbTablePrinter.address,
  forTags: dbTablePrinter.forTags,
  id: dbTablePrinter.id,
  kind: dbTablePrinter.kind,
  labelLengthMm: dbTablePrinter.labelLengthMm,
  labelWidthMm: dbTablePrinter.labelWidthMm,
  name: dbTablePrinter.name,
  shareName: dbTablePrinter.shareName,
  username: dbTablePrinter.username,
};

// Only a label printer has labels and only a share has a user, so switching a printer to another kind clears what it
// had. An empty password keeps the stored one, as the form never shows it
function toPrinterRow(input: z.output<typeof createPrinterSchema>) {
  const { password, ...fields } = input;
  const row = isLabelPrinterKind(input.kind) ? fields : { ...fields, labelLengthMm: null, labelWidthMm: null };
  if (!isSharePrinterKind(input.kind)) {
    return { ...row, password: null, shareName: null, username: null };
  }
  return password === null ? row : { ...row, password };
}

async function getPrinter(db: TDatabase, printerId: number) {
  const printer = (await db.select().from(dbTablePrinter).where(eq(dbTablePrinter.id, printerId))).at(0);
  if (!printer) {
    throw new TRPCError({ code: "NOT_FOUND", message: PRINTER_NOT_FOUND_MESSAGE(printerId) });
  }
  return printer;
}

export default router({
  create: adminProcedure.input(createPrinterSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const newPrinter = (
          await tx.insert(dbTablePrinter).values(toPrinterRow(input)).returning(PUBLIC_PRINTER_COLUMNS)
        ).at(0);
        if (!newPrinter) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Error al crear la Impresora" });
        }
        return { item: newPrinter };
      } catch (error) {
        handleMutationError({ error });
      }
    }),
  ),
  update: adminProcedure.input(updatePrinterSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const { id, ...fields } = input;
        const updatedPrinter = (
          await tx
            .update(dbTablePrinter)
            .set(toPrinterRow(fields))
            .where(eq(dbTablePrinter.id, id))
            .returning(PUBLIC_PRINTER_COLUMNS)
        ).at(0);
        if (!updatedPrinter) {
          throw new TRPCError({ code: "NOT_FOUND", message: PRINTER_NOT_FOUND_MESSAGE(id) });
        }
        return { item: updatedPrinter };
      } catch (error) {
        handleMutationError({ error });
      }
    }),
  ),
  delete: adminProcedure.input(requiredIdObjectSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const deletedPrinter = (
          await tx.delete(dbTablePrinter).where(eq(dbTablePrinter.id, input.id)).returning(PUBLIC_PRINTER_COLUMNS)
        ).at(0);
        if (!deletedPrinter) {
          throw new TRPCError({ code: "NOT_FOUND", message: PRINTER_NOT_FOUND_MESSAGE(input.id) });
        }
        return { item: deletedPrinter };
      } catch (error) {
        handleMutationError({ error });
      }
    }),
  ),
  ping: adminProcedure.input(requiredIdObjectSchema).mutation(async ({ ctx, input }) => {
    const printer = await getPrinter(ctx.db, input.id);
    try {
      await pingPrinter(printer);
    } catch (error) {
      logger.error(LogMessages.printerPingFailed, { error, printerId: printer.id });
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: PRINTER_NOT_RESPONDING_MESSAGE(printer.name) });
    }
  }),
  print: procedure.input(printFileSchema).mutation(async ({ ctx, input }) => {
    const printer = await getPrinter(ctx.db, input.printerId);

    let pdf: Buffer;
    try {
      const response = await fetch(`${APP_URL}${input.filePath}`, {
        headers: ctx.cookie === null ? undefined : { Cookie: ctx.cookie },
      });
      if (!response.ok) {
        throw new Error(`The file request answered with HTTP ${response.status}`);
      }
      pdf = Buffer.from(await response.arrayBuffer());
    } catch (error) {
      logger.error(LogMessages.printerFileReadFailed, { error, filePath: input.filePath });
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: PRINTER_FILE_UNAVAILABLE_MESSAGE });
    }

    try {
      await printPdfOnPrinter(printer, pdf);
    } catch (error) {
      logger.error(LogMessages.printerPrintFailed, { error, printerId: printer.id });
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: PRINTER_UNREACHABLE_MESSAGE(printer.name) });
    }
  }),
});
