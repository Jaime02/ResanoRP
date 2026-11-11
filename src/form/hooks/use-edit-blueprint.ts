import { useSelector } from "@tanstack/react-store";

import { useAppContext } from "@/contexts/app-context";
import { useAppForm } from "@/form";
import useResetForm from "@/form/hooks/use-reset-form";
import { BLUEPRINT_EDITED_MESSAGE } from "@/messages/blueprint";
import { type TUpdateBlueprintForm, type TBlueprint, updateBlueprintSchema } from "@/schemas/blueprint";
import trpc from "@/trpc/trpc-client";

interface UseEditBlueprintFormProps {
  blueprint?: TBlueprint | null;
  onSubmit?: () => Promise<void>;
}

export default function useEditBlueprintForm({ blueprint, onSubmit }: UseEditBlueprintFormProps) {
  const { showToastOnTRPCMutation } = useAppContext();

  const defaultValues = {
    id: blueprint?.id ?? null,
    fileName: blueprint?.fileName ?? null,
    partId: blueprint?.partId ?? null,
  };

  const form = useAppForm({
    formId: "editBlueprint",
    defaultValues,
    onSubmit: async ({ value: input }) =>
      showToastOnTRPCMutation({
        mutation: trpc.blueprint.update.mutate(input as TUpdateBlueprintForm),
        onSuccess: { title: BLUEPRINT_EDITED_MESSAGE },
        onSubmit,
      }),
    validators: {
      // @ts-expect-error partId is in the form but does not have to be validated
      onSubmit: updateBlueprintSchema,
    },
  });

  const isSubmitting = useSelector(form.store, (state) => state.isSubmitting);

  useResetForm(form, defaultValues);

  const isLoading = blueprint === undefined || isSubmitting;

  return {
    blueprint,
    form,
    validationSchema: updateBlueprintSchema,
    isLoading,
  };
}
