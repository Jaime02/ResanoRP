import { useState } from "react";

import { useAppContext } from "@/contexts/app-context";
import { BROWSER_PRINTER, getSelectedPrinter, printPdfUrl } from "@/lib/print";
import type { TPrinterOption } from "@/lib/print";
import { SENT_TO_PRINTER_MESSAGE } from "@/messages/printer";
import { useQueryPrinters } from "@/queries/printer";
import type { TTagLabelSize } from "@/schemas/printer";
import trpc from "@/trpc/trpc-client";

// The printers for part tags are only offered for them, and the rest for every other document
export function usePrintControls({ forTags }: { forTags: boolean }) {
  const { showToastOnTRPCMutation } = useAppContext();
  const { data: printers, isLoading } = useQueryPrinters({ forTags });
  const [selectedPrinterId, setSelectedPrinterId] = useState<number>();
  const [isPrinting, setIsPrinting] = useState(false);

  const printerOptions: Array<TPrinterOption> = [...printers, BROWSER_PRINTER];
  const printer = getSelectedPrinter(printers, isLoading, selectedPrinterId);
  const labelSize: TTagLabelSize =
    printer !== null && printer.labelWidthMm !== null && printer.labelLengthMm !== null
      ? { labelLengthMm: printer.labelLengthMm, labelWidthMm: printer.labelWidthMm }
      : null;

  // The path of the file as the browser requests it, undefined while it is not available. Resolves whether it was sent.
  // onSent runs before the toast, so a dialog that navigates away does not close it
  async function printPdf(filePath: string | undefined, onSent?: () => Promise<void>) {
    if (filePath === undefined || printer === null) return false;
    if (printer.id === BROWSER_PRINTER.id) {
      printPdfUrl(filePath);
      await onSent?.();
      return true;
    }
    setIsPrinting(true);
    let isSent = false;
    await showToastOnTRPCMutation({
      mutation: trpc.printer.print.mutate({ filePath, printerId: printer.id }),
      onSubmit: async () => {
        isSent = true;
        await onSent?.();
      },
      onSuccess: { title: SENT_TO_PRINTER_MESSAGE(printer.name) },
    });
    setIsPrinting(false);
    return isSent;
  }

  return {
    isBusy: isLoading || isPrinting,
    labelSize,
    printer,
    printerOptions,
    printPdf,
    selectPrinter: setSelectedPrinterId,
  };
}

export type TPrintControls = ReturnType<typeof usePrintControls>;
