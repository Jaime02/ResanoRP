import { DownloadIcon, PrinterIcon } from "lucide-react";
import { useRef, useState } from "react";

import PDFViewer from "@/components/pdf/pdf-viewer";
import PrintControls from "@/components/print/print-controls";
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
import { Separator } from "@/components/ui/separator";
import { useAppContext } from "@/contexts/app-context";
import { downloadUrl } from "@/lib/print";
import { DOWNLOAD_LABEL, PRINT_LABEL } from "@/messages/common";
import {
  PRINT_DELIVERY_NOTE_MESSAGE,
  PRINT_DELIVERY_NOTE_TITLE,
  PRINT_TWICE_LABEL,
  WITH_PRICES_LABEL,
  WITHOUT_PRICES_LABEL,
} from "@/messages/delivery-note";
import trpc from "@/trpc/trpc-client";

function getDeliveryNoteFileUrl(deliveryNoteId: number, copies: number) {
  // The file is overwritten on every print, so the URL carries the generation timestamp to keep the
  // browser from showing a previously cached version of the Albarán.
  return `/api/files/delivery-note/${deliveryNoteId}?copies=${copies}&generatedAt=${Date.now()}`;
}

interface DialogPrintDeliveryNoteProps {
  deliveryNoteId: number;
  iconOnly?: boolean;
}

export default function DialogPrintDeliveryNote({ deliveryNoteId, iconOnly = false }: DialogPrintDeliveryNoteProps) {
  const { isAdmin, showToastOnTRPCMutation } = useAppContext();

  const [isAskingForPrices, setIsAskingForPrices] = useState(false);
  // The preview takes the focus, and giving it back to the trigger meanwhile would close a combobox opened in it
  const isOpeningPreviewRef = useRef(false);
  const [withPrices, setWithPrices] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>();
  const [isLoading, setIsLoading] = useState(false);

  async function generate(printWithPrices: boolean, copies: number) {
    setIsLoading(true);
    await showToastOnTRPCMutation({
      mutation: trpc.deliveryNote.print.mutate({ copies, id: deliveryNoteId, withPrices: printWithPrices }),
    });
    setIsLoading(false);
    return getDeliveryNoteFileUrl(deliveryNoteId, copies);
  }

  async function openPreview(printWithPrices: boolean) {
    isOpeningPreviewRef.current = true;
    setIsAskingForPrices(false);
    const url = await generate(printWithPrices, 1);
    setWithPrices(printWithPrices);
    setPreviewUrl(url);
  }

  return (
    <>
      <Button
        testId="button-print-delivery-note"
        size={iconOnly ? "icon" : undefined}
        onClick={() => {
          if (!isAdmin) return void openPreview(false);
          isOpeningPreviewRef.current = false;
          setIsAskingForPrices(true);
        }}
      >
        <PrinterIcon />
        {!iconOnly && PRINT_DELIVERY_NOTE_TITLE}
      </Button>
      <AlertDialog open={isAskingForPrices} onOpenChange={setIsAskingForPrices}>
        <AlertDialogContent
          data-testid="dialog-delivery-note-prices-content"
          finalFocus={() => !isOpeningPreviewRef.current}
        >
          <AlertDialogTitle>{PRINT_DELIVERY_NOTE_TITLE}</AlertDialogTitle>
          <AlertDialogDescription>{PRINT_DELIVERY_NOTE_MESSAGE}</AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogAction
              testId="button-print-delivery-note-without-prices"
              variant="secondary"
              onClick={() => void openPreview(false)}
            >
              {WITHOUT_PRICES_LABEL}
            </AlertDialogAction>
            <AlertDialogAction
              testId="button-print-delivery-note-with-prices"
              variant="success"
              onClick={() => void openPreview(true)}
            >
              {WITH_PRICES_LABEL}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={previewUrl !== undefined} onOpenChange={(open) => !open && setPreviewUrl(undefined)}>
        <DialogContent data-testid="dialog-print-delivery-note-content" isLoading={isLoading}>
          <DialogHeader>
            <DialogTitle>Albarán {deliveryNoteId}</DialogTitle>
          </DialogHeader>
          <PDFViewer url={previewUrl} />
          <DialogFooter>
            <Button
              testId="button-download-delivery-note"
              variant="secondary"
              onClick={() => previewUrl !== undefined && downloadUrl(previewUrl, `albaran-${deliveryNoteId}.pdf`)}
            >
              <DownloadIcon />
              {DOWNLOAD_LABEL}
            </Button>
            <Separator orientation="vertical" />
            <PrintControls>
              {(printPdf, isPrinting) => (
                <>
                  <Button
                    testId="button-print-delivery-note-once"
                    disabled={isPrinting}
                    onClick={() => void printPdf(previewUrl)}
                  >
                    <PrinterIcon />
                    {PRINT_LABEL}
                  </Button>
                  <Button
                    testId="button-print-delivery-note-twice"
                    disabled={isPrinting}
                    onClick={async () => printPdf(await generate(withPrices, 2))}
                  >
                    <PrinterIcon />
                    {PRINT_TWICE_LABEL}
                  </Button>
                </>
              )}
            </PrintControls>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
