import { useSelector } from "@tanstack/react-store";

import rawMaterialCollection from "@/collections/raw-material";
import { useAppContext } from "@/contexts/app-context";
import { useAppForm } from "@/form";
import useResetForm from "@/form/hooks/use-reset-form";
import { RAW_MATERIAL_CREATED_MESSAGE, RAW_MATERIAL_EDITED_MESSAGE } from "@/messages/material";
import { useQueryRawMaterialById } from "@/queries/raw-material";
import { createRawMaterialSchema, updateRawMaterialSchema } from "@/schemas/raw-material";
import type { TCreateRawMaterial, TUpdateRawMaterial } from "@/schemas/raw-material";
import trpc from "@/trpc/trpc-client";
import { FormMode } from "@/types";
import type { BaseRawMaterialSerialized } from "@/types/raw-material";

const defaultRawMaterialFormData: { name: string | null; price: number | null; density: string | null } = {
  name: null,
  price: null,
  density: null,
};

const schemas = {
  [FormMode.Create]: createRawMaterialSchema,
  [FormMode.Update]: updateRawMaterialSchema,
  [FormMode.ReadOnly]: undefined,
  [FormMode.NotApplicable]: undefined,
};

interface UseRawMaterialFormProps {
  requestedFormMode: FormMode;
  editRawMaterialId?: number;
  onSubmit?: (rawMaterial: BaseRawMaterialSerialized) => Promise<void>;
}

export default function useRawMaterialForm({
  requestedFormMode,
  editRawMaterialId,
  onSubmit,
}: UseRawMaterialFormProps) {
  const { showToastOnTRPCMutation } = useAppContext();

  const {
    data: rawMaterial,
    isLoading: isLoadingRawMaterial,
    isLoadingError,
    isCrashed,
  } = useQueryRawMaterialById(editRawMaterialId);

  const formMode =
    rawMaterial?.deletedAt != null || requestedFormMode === FormMode.ReadOnly ? FormMode.ReadOnly : requestedFormMode;
  const validationSchema = schemas[formMode];

  const defaultValues = {
    ...(formMode !== FormMode.Create ? { id: rawMaterial?.id } : {}),
    name: formMode === FormMode.Create ? defaultRawMaterialFormData.name : (rawMaterial?.name ?? null),
    price: formMode === FormMode.Create ? defaultRawMaterialFormData.price : (rawMaterial?.price ?? null),
    density: formMode === FormMode.Create ? defaultRawMaterialFormData.density : (rawMaterial?.density ?? null),
  };

  const form = useAppForm({
    formId: "rawMaterial",
    defaultValues,
    onSubmit: async ({ value: rawMaterialFormData }) => {
      if (formMode !== FormMode.Create && formMode !== FormMode.Update) return;
      const mutation =
        formMode === FormMode.Create
          ? trpc.rawMaterial.create.mutate(rawMaterialFormData as TCreateRawMaterial)
          : trpc.rawMaterial.update.mutate(rawMaterialFormData as TUpdateRawMaterial);
      await showToastOnTRPCMutation({
        mutation,
        onSuccess: { title: formMode === FormMode.Create ? RAW_MATERIAL_CREATED_MESSAGE : RAW_MATERIAL_EDITED_MESSAGE },
        collection: rawMaterialCollection,
        onSubmit,
      });
    },
    validators: {
      onSubmit: validationSchema,
    },
  });

  const isSubmitting = useSelector(form.store, (state) => state.isSubmitting);

  useResetForm(form, defaultValues, formMode);

  const isLoading = isLoadingRawMaterial || isSubmitting;

  return {
    rawMaterial,
    validationSchema,
    form,
    formMode,
    getRawMaterialByIdError:
      isLoadingError ||
      isCrashed ||
      (editRawMaterialId !== undefined && !isLoadingRawMaterial && rawMaterial === undefined),
    isLoading,
  };
}

export type TRawMaterialForm = NonNullable<ReturnType<typeof useRawMaterialForm>["rawMaterial"]>;
