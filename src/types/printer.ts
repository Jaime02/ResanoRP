import type { InferSelectModel } from "drizzle-orm";

import type { dbTablePrinter } from "@/db/schema";

// How the server reaches the printer, and so the language it has to send it. A Windows share passes the job straight
// to the printer, so its driver is not used and the server has to speak the language of the printer itself
export enum PrinterKind {
  Ipp = "ipp",
  IntermecShare = "intermecShare",
  BrotherShare = "brotherShare",
  TscRaw = "tscRaw",
}

const SHARE_PRINTER_KINDS = new Set([PrinterKind.IntermecShare, PrinterKind.BrotherShare]);
const LABEL_PRINTER_KINDS = new Set([PrinterKind.IntermecShare, PrinterKind.TscRaw]);

export const isSharePrinterKind = (kind: PrinterKind | null) => kind !== null && SHARE_PRINTER_KINDS.has(kind);
export const isLabelPrinterKind = (kind: PrinterKind | null) => kind !== null && LABEL_PRINTER_KINDS.has(kind);

export type BasePrinter = InferSelectModel<typeof dbTablePrinter>;

// What the browsers get of a printer: its password stays on the server
export type TPublicPrinter = Omit<BasePrinter, "password">;
