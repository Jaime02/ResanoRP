import { useSelector } from "@tanstack/react-store";

import { useAppContext } from "@/contexts/app-context";
import { useAppForm } from "@/form";
import { PART_FEATURE_CREATED_MESSAGE } from "@/messages/part";
import { createPartFeatureSchema } from "@/schemas/part-feature";
import type { TCreatePartFeature } from "@/schemas/part-feature";
import trpc from "@/trpc/trpc-client";
import { FormMode } from "@/types";

interface UseCreatePartFeatureFormProps {
  partId?: number;
  onSubmit?: () => Promise<void>;
}

export default function useCreatePartFeatureForm({ partId, onSubmit }: UseCreatePartFeatureFormProps) {
  const { showToastOnTRPCMutation } = useAppContext();

  const form = useAppForm({
    formId: "createPartFeature",
    defaultValues: {
      feature: null as string | null,
      maxValue: null as string | null,
      minValue: null as string | null,
      partId,
    },
    onSubmit: async ({ value: partFeatureFormData }) =>
      showToastOnTRPCMutation({
        mutation: trpc.partFeature.create.mutate(partFeatureFormData as TCreatePartFeature),
        onSuccess: { title: PART_FEATURE_CREATED_MESSAGE },
        onSubmit,
      }),
    validators: {
      onChange: createPartFeatureSchema,
    },
  });

  const isLoading = useSelector(form.store, (state) => state.isSubmitting);

  return {
    form,
    formMode: FormMode.Create,
    isLoading,
    validationSchema: createPartFeatureSchema,
  };
}
