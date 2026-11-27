import { useSelector } from "@tanstack/react-store";

import { useAppContext } from "@/contexts/app-context";
import { useAppForm } from "@/form";
import useResetForm from "@/form/hooks/use-reset-form";
import { MATERIAL_CREATED_MESSAGE } from "@/messages/material";
import type { TCreateMaterial } from "@/schemas/material";
import { createMaterialSchema } from "@/schemas/material";
import trpc from "@/trpc/trpc-client";
import type { BaseMaterialSerialized } from "@/types/material";

const defaultMaterialFormData: {
  rawMaterialId: number | null;
  shapeId: number | null | undefined;
  width: string | null;
} = {
  rawMaterialId: null,
  shapeId: null,
  width: null,
};

interface UseCreateMaterialFormProps {
  open: boolean;
  onSubmit?: (material: BaseMaterialSerialized) => Promise<void>;
}

export default function useCreateMaterialForm({ open, onSubmit }: UseCreateMaterialFormProps) {
  const { showToastOnTRPCMutation } = useAppContext();

  const form = useAppForm({
    formId: "material",
    defaultValues: defaultMaterialFormData,
    onSubmit: async ({ value: materialFormData }) => {
      await showToastOnTRPCMutation({
        mutation: trpc.material.create.mutate(materialFormData as TCreateMaterial),
        onSuccess: { title: MATERIAL_CREATED_MESSAGE },
        onSubmit,
      });
    },
    validators: {
      onChange: createMaterialSchema,
    },
  });

  // Each time it opens, so a Material does not start with the combination of the last one, created or rejected
  useResetForm(form, open);

  const isLoading = useSelector(form.store, (state) => state.isSubmitting);

  return {
    validationSchema: createMaterialSchema,
    form,
    isLoading,
  };
}
