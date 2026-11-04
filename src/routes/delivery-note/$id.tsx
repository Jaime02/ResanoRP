import { createFileRoute, useNavigate } from "@tanstack/react-router";
import z from "zod";

import DialogPrintDeliveryNote from "@/components/dialog/print-delivery-note";
import DialogQueryError from "@/components/dialog/query-error";
import { useAppContext } from "@/contexts/app-context";
import { FormContextProvider } from "@/form";
import FormDeliveryNote from "@/form/forms/delivery-note";
import useDeliveryNoteForm from "@/form/hooks/use-delivery-note";
import { DELIVERY_NOTE_FETCH_ERROR_MESSAGE, DELIVERY_NOTE_FETCH_ERROR_TITLE } from "@/messages/delivery-note";
import { optionalIdSchema } from "@/schemas";
import { FormMode } from "@/types";

const routeParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const routeSearchSchema = z.object({
  printTagDeliveryNoteLineId: optionalIdSchema.catch(undefined),
});

export const Route = createFileRoute("/delivery-note/$id")({
  beforeLoad: ({ params }) => ({
    title: `Albarán ${params.id}`,
  }),
  component: RouteComponent,
  params: routeParamsSchema,
  validateSearch: routeSearchSchema,
});

function RouteComponent() {
  const { id } = Route.useParams();
  const { printTagDeliveryNoteLineId } = Route.useSearch();
  const { isAdmin } = useAppContext();
  const navigate = useNavigate();

  const userFormMode = isAdmin ? FormMode.Update : FormMode.ReadOnly;

  const { form, formMode, validationSchema, deliveryNote, isLoading, getDeliveryNoteByIdError } = useDeliveryNoteForm({
    deliveryNoteId: id,
    requestedFormMode: userFormMode,
  });

  if (getDeliveryNoteByIdError) {
    return (
      <DialogQueryError
        testId="dialog-error-get-delivery-note-by-id-query"
        title={DELIVERY_NOTE_FETCH_ERROR_TITLE}
        errorMessage={DELIVERY_NOTE_FETCH_ERROR_MESSAGE}
        onClose={() => void navigate({ to: "/delivery-note" })}
      />
    );
  }

  return (
    <FormContextProvider
      form={form}
      formMode={formMode}
      isLoading={isLoading}
      validationSchema={validationSchema}
      className="items-center"
    >
      <FormDeliveryNote deliveryNote={deliveryNote} printTagDeliveryNoteLineId={printTagDeliveryNoteLineId} />
      {deliveryNote != null && <DialogPrintDeliveryNote deliveryNoteId={deliveryNote.id} />}
    </FormContextProvider>
  );
}
