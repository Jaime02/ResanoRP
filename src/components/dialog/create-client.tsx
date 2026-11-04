import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import MaintenanceDialog from "@/components/dialog/maintenance-dialog";
import FormClient from "@/form/forms/client";
import useClientForm from "@/form/hooks/use-client";
import useFormMode from "@/form/hooks/use-form-mode";
import { CLIENT_CREATE_TITLE } from "@/messages/client";
import type { BaseClientSerialized } from "@/types/client";

interface CreateClientDialogProps {
  createClient?: boolean;
}

export default function CreateClientDialog({ createClient }: CreateClientDialogProps) {
  const navigate = useNavigate();

  const requestedFormMode = useFormMode({ create: createClient });

  const onSubmit = useCallback(
    async (client: BaseClientSerialized) =>
      navigate({
        params: { id: client.id },
        to: "/client/$id",
      }),
    [navigate],
  );

  const onClose = useCallback(
    async () =>
      navigate({
        search: (prev) => ({ ...prev, createClient: undefined }),
        to: ".",
      }),
    [navigate],
  );

  const {
    form,
    formMode,
    clientInvoiceEmailForm,
    clientInvoiceEmailFormValidationSchema,
    validationSchema,
    client,
    isLoading,
  } = useClientForm({
    requestedFormMode,
    onSubmit,
  });

  return (
    <MaintenanceDialog
      testId="dialog-create-client"
      open={createClient === true}
      form={form}
      formMode={formMode}
      validationSchema={validationSchema}
      isLoading={isLoading}
      onClose={onClose}
      title={CLIENT_CREATE_TITLE}
    >
      <FormClient
        form={form}
        formMode={formMode}
        clientInvoiceEmailForm={clientInvoiceEmailForm}
        clientInvoiceEmailFormValidationSchema={clientInvoiceEmailFormValidationSchema}
        isLoading={isLoading}
        client={client}
      />
    </MaintenanceDialog>
  );
}
