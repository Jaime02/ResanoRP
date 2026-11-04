import { useSelector } from "@tanstack/react-store";

import blueprintCollection from "@/collections/blueprint";
import partCollection from "@/collections/part";
import partReferenceCollection from "@/collections/part-reference";
import { useAppContext } from "@/contexts/app-context";
import { useAppForm } from "@/form";
import useResetForm from "@/form/hooks/use-reset-form";
import { objectToFormData } from "@/lib/utils";
import { PART_CREATED_MESSAGE, PART_EDITED_MESSAGE } from "@/messages/part";
import { useQueryPartForm } from "@/queries/part";
import { createPartFormSchema, updatePartSchema } from "@/schemas/part";
import type { TCreatePartForm, TUpdatePart } from "@/schemas/part";
import trpc from "@/trpc/trpc-client";
import { FormMode } from "@/types";
import type { BasePartSerialized } from "@/types/part";

const defaultPartFormData: {
  coatingId: number | null;
  description: string | null;
  length: number | null;
  notes: string | null;
  reference: {
    clientDescription: string | null;
    clientId: number | null;
    reference: string | null;
  };
  shapeId: number | null;
  width: string | null;
} = {
  coatingId: null,
  description: null,
  length: null,
  notes: null,
  reference: {
    clientDescription: null,
    clientId: null,
    reference: null,
  },
  shapeId: null,
  width: null,
};

const schemas = {
  [FormMode.Create]: createPartFormSchema,
  [FormMode.Update]: updatePartSchema,
  [FormMode.ReadOnly]: undefined,
  [FormMode.NotApplicable]: undefined,
};

interface UsePartFormProps {
  requestedFormMode: FormMode;
  partId?: number;
  skipQueries?: boolean;
  onSubmit?: (part: BasePartSerialized) => Promise<void>;
}

export default function usePartForm({ requestedFormMode, partId, skipQueries = false, onSubmit }: UsePartFormProps) {
  const { showToastOnTRPCMutation } = useAppContext();

  const {
    data: partData,
    isLoading: isLoadingPart,
    isLoadingError,
    isCrashed,
  } = useQueryPartForm({ partId, skip: skipQueries || requestedFormMode === FormMode.Create });

  const part = requestedFormMode !== FormMode.Create ? partData : undefined;

  const formMode =
    part?.deletedAt != null || requestedFormMode === FormMode.ReadOnly ? FormMode.ReadOnly : requestedFormMode;
  const validationSchema = schemas[formMode];

  const defaultValues = {
    ...(formMode !== FormMode.Create ? { id: part?.id ?? null } : undefined),
    coatingId: formMode === FormMode.Create ? defaultPartFormData.coatingId : (part?.coatingId ?? null),
    description: formMode === FormMode.Create ? defaultPartFormData.description : (part?.description ?? null),
    length: formMode === FormMode.Create ? defaultPartFormData.length : (part?.length ?? null),
    notes: formMode === FormMode.Create ? defaultPartFormData.notes : (part?.notes ?? null),
    shapeId: formMode === FormMode.Create ? defaultPartFormData.shapeId : (part?.shapeId ?? null),
    width: formMode === FormMode.Create ? defaultPartFormData.width : (part?.width ?? null),
    ...(formMode === FormMode.Create
      ? {
          blueprint: null as File | null,
          fileName: null as string | null,
          reference: {
            clientDescription: defaultPartFormData.reference.clientDescription,
            clientId: defaultPartFormData.reference.clientId,
            reference: defaultPartFormData.reference.reference,
          },
        }
      : {}),
  };

  const form = useAppForm({
    formId: "part",
    defaultValues,
    onSubmit: async ({ value: partFormData }) => {
      if (formMode !== FormMode.Create && formMode !== FormMode.Update) return;
      const { reference, ...part } = partFormData as TCreatePartForm;
      const mutation =
        formMode === FormMode.Create
          ? trpc.part.createWithPartReference.mutate(objectToFormData({ ...part, ...reference }))
          : trpc.part.update.mutate(partFormData as TUpdatePart);
      const createCollections =
        part.blueprint !== null
          ? [partCollection, partReferenceCollection, blueprintCollection]
          : [partCollection, partReferenceCollection];
      await showToastOnTRPCMutation({
        mutation,
        onSuccess: { title: formMode === FormMode.Create ? PART_CREATED_MESSAGE : PART_EDITED_MESSAGE },
        collection: formMode === FormMode.Create ? createCollections : partCollection,
        onSubmit,
      });
    },
    validators: {
      onSubmit: validationSchema,
    },
  });

  useResetForm(form, defaultValues, formMode);

  const isSubmitting = useSelector(form.store, (state) => state.isSubmitting);
  const isLoading = isLoadingPart || isSubmitting;

  return {
    validationSchema,
    form,
    formMode,
    getPartByIdError: isLoadingError || isCrashed || (partId !== undefined && !isLoadingPart && part === undefined),
    isLoading,
    part,
  };
}
