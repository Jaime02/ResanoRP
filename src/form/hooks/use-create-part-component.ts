import { useSelector } from "@tanstack/react-store";

import partComponentCollection from "@/collections/part-component";
import { useAppContext } from "@/contexts/app-context";
import { useAppForm } from "@/form";
import { PART_COMPONENT_CREATED_MESSAGE } from "@/messages/part";
import { partComponentSchema } from "@/schemas/part-component";
import type { TPartComponent } from "@/schemas/part-component";
import trpc from "@/trpc/trpc-client";
import { FormMode } from "@/types";

interface UseCreatePartComponentFormProps {
  partId?: number;
  onSubmit?: () => Promise<void>;
}

export default function useCreatePartComponentForm({ partId, onSubmit }: UseCreatePartComponentFormProps) {
  const { showToastOnTRPCMutation } = useAppContext();

  const form = useAppForm({
    formId: "createPartComponent",
    defaultValues: {
      componentPartId: null as number | null,
      parentPartId: partId,
      quantity: null as number | null,
    },
    onSubmit: async ({ value: partComponentFormData }) =>
      showToastOnTRPCMutation({
        mutation: trpc.partComponent.create.mutate(partComponentFormData as TPartComponent),
        onSuccess: { title: PART_COMPONENT_CREATED_MESSAGE },
        collection: partComponentCollection,
        onSubmit,
      }),
    validators: {
      onChange: partComponentSchema,
    },
  });

  const isLoading = useSelector(form.store, (state) => state.isSubmitting);

  return {
    form,
    formMode: FormMode.Create,
    isLoading,
    validationSchema: partComponentSchema,
  };
}
