import { FileDownIcon } from "lucide-react";
import { useCallback, useState } from "react";

import invoiceCollection from "@/collections/invoice";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useAppContext } from "@/contexts/app-context";
import { downloadUrl } from "@/lib/print";
import {
  ACCOUNT_INVOICES_DESCRIPTION_MESSAGE,
  ACCOUNT_INVOICES_TITLE,
  ACCOUNT_LABEL,
  INVOICES_ACCOUNTED_MESSAGE,
} from "@/messages/invoice";
import trpc from "@/trpc/trpc-client";

function downloadBase64File(content: string, fileName: string, type: string) {
  const bytes = Uint8Array.from(atob(content), (character) => character.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  downloadUrl(url, fileName);
  URL.revokeObjectURL(url);
}

export default function DialogAccountInvoices() {
  const { showToastOnTRPCMutation } = useAppContext();
  const [isOpen, setIsOpen] = useState(false);

  const accountInvoices = useCallback(async () => {
    const result = await showToastOnTRPCMutation({
      mutation: trpc.invoice.account.mutate(),
      collection: invoiceCollection,
      onSuccess: { title: INVOICES_ACCOUNTED_MESSAGE },
    });
    if (!result) return;
    downloadBase64File(result.content, result.fileName, "text/csv");
  }, [showToastOnTRPCMutation]);

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogTrigger testId="button-account-invoices" onClick={() => setIsOpen(true)}>
        <FileDownIcon /> {ACCOUNT_INVOICES_TITLE}
      </AlertDialogTrigger>
      <AlertDialogContent data-testid="dialog-account-invoices-content">
        <AlertDialogTitle>{ACCOUNT_INVOICES_TITLE}</AlertDialogTitle>
        <AlertDialogDescription>{ACCOUNT_INVOICES_DESCRIPTION_MESSAGE}</AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogAction variant="success" onClick={() => void accountInvoices()}>
            <FileDownIcon />
            {ACCOUNT_LABEL}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
