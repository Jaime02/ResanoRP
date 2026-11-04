import { useSelector } from "@tanstack/react-store";
import { useEffect } from "react";

import deliveryNoteCollection from "@/collections/delivery-note";
import { useAppContext } from "@/contexts/app-context";
import { useAppForm } from "@/form";
import useResetForm from "@/form/hooks/use-reset-form";
import { useNow } from "@/lib/use-now";
import { DELIVERY_NOTE_CREATED_MESSAGE, DELIVERY_NOTE_EDITED_MESSAGE } from "@/messages/delivery-note";
import type { TDeliveryNote } from "@/queries/delivery-note";
import { useQueryDeliveryNoteById, useQueryNextDeliveryNoteId } from "@/queries/delivery-note";
import { createDeliveryNoteSchema, updateDeliveryNoteSchema } from "@/schemas/delivery-note";
import type { TCreateDeliveryNote, TUpdateDeliveryNote } from "@/schemas/delivery-note";
import trpc from "@/trpc/trpc-client";
import { FormMode } from "@/types";
import type { BaseDeliveryNoteSerialized } from "@/types/delivery-note";

const defaultDeliveryNoteFormData: {
  clientId: number | null;
  deliveryMethodId: number | null;
} = {
  clientId: null,
  deliveryMethodId: null,
};

const schemas = {
  [FormMode.Create]: createDeliveryNoteSchema,
  [FormMode.Update]: updateDeliveryNoteSchema,
  [FormMode.ReadOnly]: undefined,
  [FormMode.NotApplicable]: undefined,
};

type UseDeliveryNoteFormProps = {
  requestedFormMode: FormMode;
  onSubmit?: (deliveryNote: BaseDeliveryNoteSerialized) => Promise<void>;
} & (
  | { controlledDeliveryNote: TDeliveryNote; deliveryNoteId?: never }
  | { deliveryNoteId?: number; controlledDeliveryNote?: never }
);

export default function useDeliveryNoteForm({
  requestedFormMode,
  controlledDeliveryNote,
  deliveryNoteId,
  onSubmit,
}: UseDeliveryNoteFormProps) {
  const { showToastOnTRPCMutation } = useAppContext();

  const {
    data: queryDeliveryNote,
    isLoading: isLoadingDeliveryNote,
    isLoadingError,
    isCrashed,
  } = useQueryDeliveryNoteById({
    deliveryNoteId,
    skip: controlledDeliveryNote !== undefined || requestedFormMode === FormMode.Create,
  });
  const deliveryNote = controlledDeliveryNote ?? queryDeliveryNote;

  const formMode = requestedFormMode;
  const validationSchema = schemas[formMode];

  const now = useNow();

  const nextDeliveryNoteId = useQueryNextDeliveryNoteId({ skip: formMode !== FormMode.Create });

  const defaultValues = {
    clientId: formMode === FormMode.Create ? defaultDeliveryNoteFormData.clientId : (deliveryNote?.clientId ?? null),
    deliveryDate:
      formMode === FormMode.Create ? now : deliveryNote?.deliveryDate ? new Date(deliveryNote.deliveryDate) : null,
    deliveryMethodId:
      formMode === FormMode.Create
        ? defaultDeliveryNoteFormData.deliveryMethodId
        : (deliveryNote?.deliveryMethodId ?? null),
    id: formMode === FormMode.Create ? null : (deliveryNote?.id ?? null),
  };

  const form = useAppForm({
    formId: "deliveryNote",
    defaultValues,
    onSubmit: async ({ value: deliveryNoteFormData }) => {
      if (formMode !== FormMode.Create && formMode !== FormMode.Update) return;

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { clientId, ...updateDeliveryNoteData } = deliveryNoteFormData;
      const mutation =
        formMode === FormMode.Create
          ? trpc.deliveryNote.create.mutate({ ...deliveryNoteFormData, id: undefined } as TCreateDeliveryNote)
          : trpc.deliveryNote.update.mutate(updateDeliveryNoteData as TUpdateDeliveryNote);
      await showToastOnTRPCMutation({
        mutation,
        onSuccess: {
          title: formMode === FormMode.Create ? DELIVERY_NOTE_CREATED_MESSAGE : DELIVERY_NOTE_EDITED_MESSAGE,
        },
        collection: deliveryNoteCollection,
        onSubmit,
      });
    },
    validators: {
      // @ts-expect-error The form uses the clientId value, but it is not part of the Update schema
      onSubmit: validationSchema,
    },
  });

  useResetForm(form, defaultValues, formMode);

  // Set apart from the default values, so a later number doesn't reset what the user already filled in
  useEffect(() => {
    if (nextDeliveryNoteId !== null) form.setFieldValue("id", nextDeliveryNoteId, { dontUpdateMeta: true });
  }, [form, nextDeliveryNoteId]);

  const isSubmitting = useSelector(form.store, (state) => state.isSubmitting);
  const isLoading = isLoadingDeliveryNote || isSubmitting;

  return {
    deliveryNote,
    validationSchema,
    form,
    formMode,
    getDeliveryNoteByIdError:
      isLoadingError ||
      isCrashed ||
      (deliveryNoteId !== undefined && !isLoadingDeliveryNote && deliveryNote === undefined),
    isLoading,
  };
}
