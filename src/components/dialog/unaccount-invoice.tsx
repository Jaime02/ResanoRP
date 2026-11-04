import { Undo2Icon } from "lucide-react";
import { useState } from "react";

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
import { INVOICE_UNACCOUNTED_MESSAGE, MARK_LABEL, UNACCOUNT_INVOICE_TITLE } from "@/messages/invoice";
import trpc from "@/trpc/trpc-client";

interface DialogUnaccountInvoiceProps {
  invoiceId: number;
  disabled?: boolean;
}

export default function DialogUnaccountInvoice({ invoiceId, disabled }: DialogUnaccountInvoiceProps) {
  const { showToastOnTRPCMutation } = useAppContext();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogTrigger
        testId="button-unaccount-invoice"
        size="icon"
        onClick={() => {
          setIsOpen(true);
        }}
        disabled={disabled}
      >
        <Undo2Icon />
        <span className="sr-only">{UNACCOUNT_INVOICE_TITLE}</span>
      </AlertDialogTrigger>
      <AlertDialogContent data-testid="dialog-unaccount-invoice-content">
        <AlertDialogTitle>{UNACCOUNT_INVOICE_TITLE}</AlertDialogTitle>
        <AlertDialogDescription>
          La Factura {invoiceId} volverá a incluirse en el próximo fichero para exportar. Si ya se importó, aparecerá
          duplicada en la contabilidad.
        </AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogAction
            variant="success"
            onClick={() =>
              void showToastOnTRPCMutation({
                mutation: trpc.invoice.unaccount.mutate({ id: invoiceId }),
                collection: invoiceCollection,
                onSuccess: { title: INVOICE_UNACCOUNTED_MESSAGE },
              })
            }
          >
            <Undo2Icon />
            {MARK_LABEL}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
