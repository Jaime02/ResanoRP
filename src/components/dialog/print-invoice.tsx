import { DownloadIcon, PrinterIcon } from "lucide-react";
import { useCallback, useState } from "react";

import PDFViewer from "@/components/pdf/pdf-viewer";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAppContext } from "@/contexts/app-context";
import { downloadUrl, printPdfUrl } from "@/lib/print";
import { DOWNLOAD_LABEL, PRINT_LABEL } from "@/messages/common";
import trpc from "@/trpc/trpc-client";

function getInvoiceFileUrl(invoiceId: number) {
  // The file is overwritten on every print, so the URL carries the generation timestamp to keep the
  // browser from showing a previously cached version of the Factura.
  return `/api/files/invoice/${invoiceId}?generatedAt=${Date.now()}`;
}

interface DialogPrintInvoiceProps {
  invoiceId: number;
}

export default function DialogPrintInvoice({ invoiceId }: DialogPrintInvoiceProps) {
  const { showToastOnTRPCMutation } = useAppContext();

  const [previewUrl, setPreviewUrl] = useState<string>();
  const [isLoading, setIsLoading] = useState(false);

  const openPreview = useCallback(async () => {
    setIsLoading(true);
    await showToastOnTRPCMutation({ mutation: trpc.invoice.print.mutate({ id: invoiceId }) });
    setPreviewUrl(getInvoiceFileUrl(invoiceId));
    setIsLoading(false);
  }, [invoiceId, showToastOnTRPCMutation]);

  return (
    <>
      <Button testId="button-print-invoice" size="icon" onClick={() => void openPreview()}>
        <PrinterIcon />
      </Button>
      <Dialog
        open={previewUrl !== undefined}
        onOpenChange={(open) => {
          if (!open) {
            setPreviewUrl(undefined);
          }
        }}
      >
        <DialogContent data-testid="dialog-print-invoice-content" isLoading={isLoading}>
          <DialogHeader>
            <DialogTitle>Factura {invoiceId}</DialogTitle>
          </DialogHeader>
          <PDFViewer url={previewUrl} />
          <DialogFooter>
            <Button
              testId="button-download-invoice"
              variant="secondary"
              onClick={() => {
                if (previewUrl === undefined) return;
                downloadUrl(previewUrl, `Factura ${invoiceId}.pdf`);
              }}
            >
              <DownloadIcon />
              {DOWNLOAD_LABEL}
            </Button>
            <Button
              testId="button-print-invoice-once"
              onClick={() => {
                if (previewUrl === undefined) return;
                printPdfUrl(previewUrl);
              }}
            >
              <PrinterIcon />
              {PRINT_LABEL}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
