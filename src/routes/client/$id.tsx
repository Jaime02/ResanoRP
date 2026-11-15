import { useDbClient } from "@tanstack/react-db";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { TriangleAlertIcon } from "lucide-react";
import { z } from "zod";

import clientCollection from "@/collections/client";
import DialogQueryError from "@/components/dialog/query-error";
import ButtonDeleteModel from "@/components/table/button-delete-model";
import ButtonRestoreModel from "@/components/table/button-restore-model";
import { Badge } from "@/components/ui/badge";
import ButtonLink from "@/components/ui/button-link";
import { useAppContext } from "@/contexts/app-context";
import { FormContextProvider } from "@/form";
import FormClient from "@/form/forms/client";
import useClientForm from "@/form/hooks/use-client";
import { serializeClient } from "@/lib/serializers";
import {
  CLIENT_DELETE_PAGE_MESSAGE,
  CLIENT_DELETE_TITLE,
  CLIENT_DELETED_MESSAGE,
  CLIENT_FETCH_ERROR_MESSAGE,
  CLIENT_FETCH_ERROR_TITLE,
  CLIENT_RESTORE_PAGE_MESSAGE,
  CLIENT_RESTORE_TITLE,
  CLIENT_RESTORED_MESSAGE,
  CLIENT_EDIT_TITLE,
  VIEW_CLIENTS_LABEL,
} from "@/messages/client";
import { CLIENT_LABEL, RESTORE_LABEL, DELETE_LABEL } from "@/messages/common";
import trpc from "@/trpc/trpc-client";
import { FormMode } from "@/types";

const routeParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const Route = createFileRoute("/client/$id")({
  beforeLoad: () => ({
    title: CLIENT_LABEL,
  }),
  component: RouteComponent,
  params: routeParamsSchema,
});

function RouteComponent() {
  const { id: clientId } = Route.useParams();

  const { isAdmin, showToastOnTransaction, showToastOnTRPCMutation } = useAppContext();
  const navigate = useNavigate();
  const dbClient = useDbClient();

  const requestedFormMode = isAdmin ? FormMode.Update : FormMode.ReadOnly;

  const {
    form,
    formMode,
    clientInvoiceEmailForm,
    clientInvoiceEmailFormValidationSchema,
    validationSchema,
    client,
    isLoading,
    getClientByIdError,
  } = useClientForm({
    editClientId: clientId,
    requestedFormMode,
  });

  if (getClientByIdError) {
    return (
      <DialogQueryError
        testId="dialog-error-get-client-by-id-query"
        title={CLIENT_FETCH_ERROR_TITLE}
        errorMessage={CLIENT_FETCH_ERROR_MESSAGE}
        onClose={() => void navigate({ search: { tab: "client" }, to: "/maintenance" })}
      />
    );
  }

  return (
    <FormContextProvider
      testId="form-client"
      form={form}
      formMode={formMode}
      isLoading={isLoading}
      validationSchema={validationSchema}
      className="items-center"
    >
      <div className="flex flex-row items-center gap-2">
        <ButtonLink to="/maintenance" search={{ tab: "client" }}>
          {VIEW_CLIENTS_LABEL}
        </ButtonLink>
        {client?.deletedAt && (
          <>
            <Badge variant="destructive" size="lg" testId="badge-client-deleted">
              <TriangleAlertIcon className="size-icon" />
              {CLIENT_DELETED_MESSAGE}
            </Badge>
            <ButtonRestoreModel
              dialogTitle={CLIENT_RESTORE_TITLE}
              dialogDescription={CLIENT_RESTORE_PAGE_MESSAGE}
              serializedModel={serializeClient(client)}
              triggerExtraComponents={RESTORE_LABEL}
              size="default"
              onConfirm={() =>
                void showToastOnTRPCMutation({
                  mutation: trpc.client.restore.mutate({ id: client.id }),
                  onSuccess: { title: CLIENT_RESTORED_MESSAGE },
                })
              }
            />
          </>
        )}
      </div>
      <FormClient
        form={form}
        formMode={formMode}
        clientInvoiceEmailForm={clientInvoiceEmailForm}
        clientInvoiceEmailFormValidationSchema={clientInvoiceEmailFormValidationSchema}
        isLoading={isLoading}
        client={client}
      />
      <div className="flex flex-row gap-2">
        {client?.deletedAt === null && isAdmin && (
          <ButtonDeleteModel
            dialogTitle={CLIENT_DELETE_TITLE}
            dialogDescription={CLIENT_DELETE_PAGE_MESSAGE}
            serializedModel={serializeClient(client)}
            triggerExtraComponents={DELETE_LABEL}
            size="default"
            onConfirm={async () =>
              showToastOnTransaction({
                transaction: () =>
                  dbClient.collection(clientCollection).delete(client.id, {
                    optimistic: import.meta.env.VITE_ENV_NAME !== "test",
                  }),
                onSuccess: { title: CLIENT_DELETED_MESSAGE },
              })
            }
          />
        )}
        {formMode !== FormMode.ReadOnly && <form.ButtonSubmit className="self-end" customText={CLIENT_EDIT_TITLE} />}
      </div>
    </FormContextProvider>
  );
}
