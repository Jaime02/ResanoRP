import { DownloadIcon, PrinterIcon } from "lucide-react";
import { useState } from "react";

import PDFViewer from "@/components/pdf/pdf-viewer";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAppContext } from "@/contexts/app-context";
import { downloadUrl, printPdfUrl } from "@/lib/print";
import { DOWNLOAD_LABEL, PRINT_LABEL } from "@/messages/common";
import {
  PENDING_SELL_ORDERS_TITLE,
  PRINT_PENDING_SELL_ORDERS_MESSAGE,
  PRINT_PENDING_SELL_ORDERS_TITLE,
  WITH_COLUMNS_LABEL,
  WITHOUT_COLUMNS_LABEL,
} from "@/messages/sell-order";

interface DialogPrintPendingSellOrdersProps {
  clientId: number | null;
  disabled?: boolean;
}

export default function DialogPrintPendingSellOrders({
  clientId,
  disabled = false,
}: DialogPrintPendingSellOrdersProps) {
  const { isAdmin } = useAppContext();

  const [isAskingForCheckboxes, setIsAskingForCheckboxes] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>();

  function openPreview(withCheckboxes: boolean) {
    setIsAskingForCheckboxes(false);
    // The pending lines change over time, so the timestamp keeps the browser from reusing a cached document
    setPreviewUrl(
      `/api/files/pending-sell-orders/${clientId}?withCheckboxes=${withCheckboxes}&generatedAt=${Date.now()}`,
    );
  }

  return (
    <>
      <Button
        testId="button-print-pending-sell-orders"
        disabled={disabled || clientId === null}
        size="icon"
        onClick={() => {
          if (isAdmin) {
            setIsAskingForCheckboxes(true);
            return;
          }
          openPreview(true);
        }}
      >
        <PrinterIcon />
      </Button>
      <AlertDialog open={isAskingForCheckboxes} onOpenChange={setIsAskingForCheckboxes}>
        <AlertDialogContent data-testid="dialog-pending-sell-orders-checkboxes-content">
          <AlertDialogTitle>{PRINT_PENDING_SELL_ORDERS_TITLE}</AlertDialogTitle>
          <AlertDialogDescription>{PRINT_PENDING_SELL_ORDERS_MESSAGE}</AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogAction
              testId="button-print-pending-sell-orders-without-checkboxes"
              variant="secondary"
              onClick={() => openPreview(false)}
            >
              {WITHOUT_COLUMNS_LABEL}
            </AlertDialogAction>
            <AlertDialogAction
              testId="button-print-pending-sell-orders-with-checkboxes"
              variant="success"
              onClick={() => openPreview(true)}
            >
              {WITH_COLUMNS_LABEL}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog
        open={previewUrl !== undefined}
        onOpenChange={(open) => {
          if (!open) {
            setPreviewUrl(undefined);
          }
        }}
      >
        <DialogContent data-testid="dialog-print-pending-sell-orders-content">
          <DialogHeader>
            <DialogTitle>{PENDING_SELL_ORDERS_TITLE}</DialogTitle>
          </DialogHeader>
          {previewUrl !== undefined && <PDFViewer url={previewUrl} landscape />}
          <DialogFooter>
            <Button
              testId="button-download-pending-sell-orders"
              variant="secondary"
              onClick={() => {
                if (previewUrl === undefined) return;
                downloadUrl(previewUrl);
              }}
            >
              <DownloadIcon />
              {DOWNLOAD_LABEL}
            </Button>
            <Button
              testId="button-print-pending-sell-orders-once"
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
