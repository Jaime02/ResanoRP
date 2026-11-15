import { FileDownIcon } from "lucide-react";
import { useCallback, useState } from "react";

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

export default function DialogAccountInvoices() {
  const { showToastOnTRPCMutation } = useAppContext();
  const [isOpen, setIsOpen] = useState(false);

  const accountInvoices = useCallback(async () => {
    await showToastOnTRPCMutation({
      // Downloaded as soon as the server answers: the Facturas are already accounted, so a sync that times out
      // must not lose the file
      mutation: trpc.invoice.account.mutate().then((result) => {
        downloadUrl(`/api/files/accounting-export/${result.fileName}?generatedAt=${Date.now()}`, result.fileName);
        return result;
      }),
      onSuccess: { title: INVOICES_ACCOUNTED_MESSAGE },
    });
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
