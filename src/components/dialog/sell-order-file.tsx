import { DownloadIcon, FileTextIcon, PrinterIcon } from "lucide-react";
import { useState } from "react";

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
  VIEW_FILE_LABEL,
} from "@/messages/sell-order";
import type { TSellOrder } from "@/schemas/sell-order";
import trpc from "@/trpc/trpc-client";

function getSellOrderFileUrl(sellOrderId: number, fileUploadedAt: Date) {
  // Uploading a new file replaces the previous one, so the URL carries the upload timestamp to keep the browser from
  // showing a previously cached version of the Pedido de venta.
  return `/api/files/sell-order/${sellOrderId}?uploadedAt=${fileUploadedAt.getTime()}`;
}

interface DialogSellOrderFileProps {
  sellOrder: Pick<TSellOrder, "id" | "fileUploadedAt">;
  iconOnly?: boolean;
}

export default function DialogSellOrderFile({ sellOrder, iconOnly = false }: DialogSellOrderFileProps) {
  const { isAdmin, showToastOnTRPCMutation } = useAppContext();
  const { id: sellOrderId, fileUploadedAt } = sellOrder;

  const [previewUrl, setPreviewUrl] = useState<string>();

  if (!isAdmin) return null;

  return (
    <>
      <Button
        testId="button-sell-order-file"
        size={iconOnly ? "icon" : undefined}
        disabled={fileUploadedAt === null}
        onClick={() => {
          if (fileUploadedAt === null) return;
          setPreviewUrl(getSellOrderFileUrl(sellOrderId, fileUploadedAt));
        }}
      >
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
          <PDFViewer url={previewUrl} />
          <DialogFooter>
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
