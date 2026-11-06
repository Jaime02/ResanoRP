import { useSelector } from "@tanstack/react-store";

import qualityCheckCollection from "@/collections/quality-check";
import { useAppContext } from "@/contexts/app-context";
import { useAppForm } from "@/form";
import useResetForm from "@/form/hooks/use-reset-form";
import { QUALITY_CHECK_SAVED_MESSAGE } from "@/messages/production-order";
import { createQualityCheckSchema } from "@/schemas/quality-check";
import type { TCreateQualityCheck } from "@/schemas/quality-check";
import trpc from "@/trpc/trpc-client";
import { FormMode } from "@/types";

interface UseCreateQualityCheckFormProps {
  productionOrderId: number;
  partFeatureIds: Array<number>;
  onSubmit?: () => Promise<void>;
}

export default function useCreateQualityCheckForm({
  productionOrderId,
  partFeatureIds,
  onSubmit,
}: UseCreateQualityCheckFormProps) {
  const { showToastOnTRPCMutation } = useAppContext();

  const form = useAppForm({
    formId: "createQualityCheck",
    defaultValues: {
      producedQuantity: null as number | null,
      productionOrderId,
      results: partFeatureIds.map((partFeatureId) => ({
        notes: null as string | null,
        ok: true,
        partFeatureId,
        value: null as string | null,
      })),
    },
    onSubmit: async ({ value: qualityCheckFormData }) =>
      showToastOnTRPCMutation({
        mutation: trpc.qualityCheck.create.mutate(qualityCheckFormData as TCreateQualityCheck),
        onSuccess: { title: QUALITY_CHECK_SAVED_MESSAGE },
        collection: qualityCheckCollection,
        onSubmit,
      }),
    validators: {
      onSubmit: createQualityCheckSchema,
    },
  });

  useResetForm(form, productionOrderId, partFeatureIds);

  const isLoading = useSelector(form.store, (state) => state.isSubmitting);

  return {
    form,
    formMode: FormMode.Create,
    isLoading,
    validationSchema: createQualityCheckSchema,
  };
}
