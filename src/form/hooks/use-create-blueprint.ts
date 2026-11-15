import { useSelector } from "@tanstack/react-store";

import { useAppContext } from "@/contexts/app-context";
import { useAppForm } from "@/form";
import useResetForm from "@/form/hooks/use-reset-form";
import { objectToFormData } from "@/lib/utils";
import { BLUEPRINT_CREATED_MESSAGE } from "@/messages/blueprint";
import type { TCreateBlueprint } from "@/schemas/blueprint";
import { createBlueprintFormDataSchema } from "@/schemas/blueprint";
import trpc from "@/trpc/trpc-client";
import type { BaseBlueprintSerialized } from "@/types/blueprint";

interface UseCreateBlueprintFormProps {
  partId?: number;
  onSubmit?: (blueprint: BaseBlueprintSerialized) => Promise<void>;
}

export default function useCreateBlueprintForm({ partId, onSubmit }: UseCreateBlueprintFormProps) {
  const { showToastOnTRPCMutation } = useAppContext();

  const form = useAppForm({
    formId: "createBlueprint",
    defaultValues: {
      blueprint: null as File | null,
      fileName: null as string | null,
      partId: partId ?? null,
    },
    onSubmit: async ({ value: input }) =>
      showToastOnTRPCMutation({
        mutation: trpc.blueprint.create.mutate(objectToFormData(input as TCreateBlueprint)),
        onSuccess: { title: BLUEPRINT_CREATED_MESSAGE },
        onSubmit,
      }),
    validators: {
      // @ts-expect-error FormData validation does not work currently
      onSubmit: createBlueprintFormDataSchema,
    },
  });

  useResetForm(form, partId);

  const isLoading = useSelector(form.store, (state) => state.isSubmitting);

  return {
    form,
    validationSchema: createBlueprintFormDataSchema,
    isLoading,
  };
}
