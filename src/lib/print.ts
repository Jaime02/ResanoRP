import { BROWSER_PRINTER_LABEL } from "@/messages/printer";
import type { TPublicPrinter } from "@/types/printer";

export type TPrinterOption = Pick<TPublicPrinter, "id" | "name" | "labelWidthMm" | "labelLengthMm">;

// Printer ids start at 1, so 0 never collides with a stored one
export const BROWSER_PRINTER: TPrinterOption = {
  id: 0,
  labelLengthMm: null,
  labelWidthMm: null,
  name: BROWSER_PRINTER_LABEL,
};

// The browser is the last option, so it is only the default without printers. While they load the default is unknown, so
// there is none, and nothing is printed on the browser instead of the printer that was about to show up. Looked up by
// id, so a printer renamed in another tab keeps its new name, and one deleted falls back to the first
export function getSelectedPrinter(
  printers: Array<TPrinterOption>,
  isLoading: boolean,
  selectedPrinterId: number | undefined,
) {
  if (isLoading) return null;
  const printerOptions = [...printers, BROWSER_PRINTER];
  return printerOptions.find((printerOption) => printerOption.id === selectedPrinterId) ?? printerOptions[0];
}

// A PDF served into a hidden iframe is printed by the browser itself, so the number of copies has to
// come baked into the document: the print dialog is the user's, not ours to configure.
export function printPdfUrl(url: string) {
  const iframe = document.createElement("iframe");
  iframe.style.display = "none";
  iframe.src = url;
  iframe.onload = () => {
    const iframeWindow = iframe.contentWindow;
    if (iframeWindow === null) {
      iframe.remove();
      return;
    }
    try {
      iframeWindow.addEventListener("afterprint", () => {
        iframe.remove();
      });
      iframeWindow.focus();
      iframeWindow.print();
    } catch {
      // Firefox shows the PDF in its own viewer, which a page cannot script, so the user prints it from a tab
      iframe.remove();
      window.open(url, "_blank");
    }
  };
  document.body.append(iframe);
}

// An empty download attribute makes the browser use the file name sent by the server
export function downloadUrl(url: string, fileName = "") {
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
}
