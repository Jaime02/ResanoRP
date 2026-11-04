import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import MaintenanceDialog from "@/components/dialog/maintenance-dialog";
import TablePendingDeliveryNote from "@/components/table/pending-delivery-note";
import FieldLayoutContainer from "@/form/components/field-layout-container";
import useCreateInvoiceForm from "@/form/hooks/use-create-invoice";
import { formatCents } from "@/lib/prices";
import { FROM_LABEL, TO_LABEL } from "@/messages/common";
import { INVOICE_CREATE_TITLE } from "@/messages/invoice";

interface CreateInvoiceDialogProps {
  createInvoice?: boolean;
}

export default function CreateInvoiceDialog({ createInvoice }: CreateInvoiceDialogProps) {
  const navigate = useNavigate();

  const onClose = useCallback(
    async () =>
      navigate({
        search: (prev) => ({ ...prev, createInvoice: undefined }),
        to: ".",
      }),
    [navigate],
  );

  const {
    form,
    formMode,
    validationSchema,
    isLoading,
    pendingDeliveryNotes,
    pendingDeliveryNotesTotalInCents,
    isLoadingPendingDeliveryNotes,
  } = useCreateInvoiceForm({ onSubmit: onClose });

  return (
    <MaintenanceDialog
      testId="dialog-create-invoice"
      open={createInvoice === true}
      form={form}
      formMode={formMode}
      validationSchema={validationSchema}
      onClose={onClose}
      isLoading={isLoading}
      title={INVOICE_CREATE_TITLE}
      layoutClassName="items-start"
      submitDisabled={pendingDeliveryNotes.length === 0}
    >
      <div className="flex flex-col gap-3">
        <form.AppField
          name="clientId"
          children={(field) => <field.ClientCombobox id="dialog-create-invoice-client" nullable />}
        />
        <form.AppField
          name="startDate"
          children={(field) => <field.DateInput id="dialog-create-invoice-start-date" label={FROM_LABEL} />}
        />
        <form.AppField
          name="endDate"
          children={(field) => <field.DateInput id="dialog-create-invoice-end-date" label={TO_LABEL} />}
        />
      </div>
      <FieldLayoutContainer>
        <div className="max-h-[70vh] overflow-auto">
          <TablePendingDeliveryNote
            title={`${pendingDeliveryNotes.length} Albaranes pendientes de facturar`}
            rows={pendingDeliveryNotes}
            isLoading={isLoadingPendingDeliveryNotes}
          />
        </div>
        <span data-testid="span-pending-delivery-notes-total" className="self-end font-bold">
          Total sin IVA: {formatCents(pendingDeliveryNotesTotalInCents)}
        </span>
      </FieldLayoutContainer>
    </MaintenanceDialog>
  );
}
