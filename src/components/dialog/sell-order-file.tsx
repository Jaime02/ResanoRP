import { DownloadIcon, FileTextIcon, PrinterIcon } from "lucide-react";
import { useCallback, useState } from "react";

import PDFViewer from "@/components/pdf/pdf-viewer";
import ButtonDeleteModel from "@/components/table/button-delete-model";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAppContext } from "@/contexts/app-context";
import { downloadUrl, printPdfUrl } from "@/lib/print";
import { DOWNLOAD_LABEL, PRINT_LABEL } from "@/messages/common";
import {
  DELETE_SELL_ORDER_FILE_MESSAGE,
  DELETE_SELL_ORDER_FILE_TITLE,
  SELL_ORDER_FILE_DELETED_MESSAGE,
  SELL_ORDER_NO_FILE_MESSAGE,
  VIEW_FILE_LABEL,
} from "@/messages/sell-order";
import trpc from "@/trpc/trpc-client";

function getSellOrderFileUrl(sellOrderId: number) {
  // Uploading a new file replaces the previous one, so the URL carries the opening timestamp to keep the browser from
  // showing a previously cached version of the Pedido de venta.
  return `/api/files/sell-order/${sellOrderId}?openedAt=${Date.now()}`;
}

interface DialogSellOrderFileProps {
  sellOrderId: number;
  iconOnly?: boolean;
}

export default function DialogSellOrderFile({ sellOrderId, iconOnly = false }: DialogSellOrderFileProps) {
  const { isAdmin, showToastOnTRPCMutation, toaster } = useAppContext();

  const [previewUrl, setPreviewUrl] = useState<string>();

  const openPreview = useCallback(async () => {
    if (!(await trpc.sellOrder.hasFile.query(sellOrderId))) {
      toaster.info({ title: SELL_ORDER_NO_FILE_MESSAGE });
      return;
    }
    setPreviewUrl(getSellOrderFileUrl(sellOrderId));
  }, [sellOrderId, toaster]);

  return (
    <>
      <Button testId="button-sell-order-file" size={iconOnly ? "icon" : undefined} onClick={() => void openPreview()}>
        <FileTextIcon />
        {!iconOnly && VIEW_FILE_LABEL}
      </Button>
      <Dialog
        open={previewUrl !== undefined}
        onOpenChange={(open) => {
          if (!open) {
            setPreviewUrl(undefined);
          }
        }}
      >
        <DialogContent data-testid="dialog-sell-order-file-content">
          <DialogHeader>
            <DialogTitle>Pedido de venta {sellOrderId}</DialogTitle>
          </DialogHeader>
          {previewUrl !== undefined && <PDFViewer url={previewUrl} />}
          <DialogFooter>
            {isAdmin && (
              <ButtonDeleteModel
                dialogTriggerTestId="button-delete-sell-order-file"
                dialogTitle={DELETE_SELL_ORDER_FILE_TITLE}
                dialogDescription={DELETE_SELL_ORDER_FILE_MESSAGE}
                onConfirm={async () => {
                  const result = await showToastOnTRPCMutation({
                    mutation: trpc.sellOrder.deleteFile.mutate(sellOrderId),
                    onSuccess: { title: SELL_ORDER_FILE_DELETED_MESSAGE },
                  });
                  if (result !== null) {
                    setPreviewUrl(undefined);
                  }
                }}
              />
            )}
            <Button
              testId="button-download-sell-order-file"
              variant="secondary"
              onClick={() => {
                if (previewUrl === undefined) return;
                downloadUrl(previewUrl, `Pedido de venta ${sellOrderId}.pdf`);
              }}
            >
              <DownloadIcon />
              {DOWNLOAD_LABEL}
            </Button>
            <Button
              testId="button-print-sell-order-file"
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
