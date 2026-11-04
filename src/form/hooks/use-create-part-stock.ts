import { useSelector } from "@tanstack/react-store";

import partStockCollection from "@/collections/part-stock";
import { useAppContext } from "@/contexts/app-context";
import { useAppForm } from "@/form";
import { PART_STOCK_CREATED_MESSAGE } from "@/messages/part";
import { createPartStockSchema } from "@/schemas/part-stock";
import type { TCreatePartStock } from "@/schemas/part-stock";
import trpc from "@/trpc/trpc-client";
import { FormMode } from "@/types";
import type { BasePartStockSerialized } from "@/types/part-stock";

const defaultPartStockFormData = {
  partId: null,
  quantity: null,
};

interface UseCreatePartStockFormProps {
  partId: number;
  onSubmit?: (partStock: BasePartStockSerialized) => Promise<void>;
}

export default function useCreatePartStockForm({ partId, onSubmit }: UseCreatePartStockFormProps) {
  const { showToastOnTRPCMutation } = useAppContext();

  const form = useAppForm({
    formId: "createPartStock",
    defaultValues: {
      partId,
      quantity: defaultPartStockFormData.quantity as number | null,
    },
    onSubmit: async ({ value: partStockFormData }) =>
      showToastOnTRPCMutation({
        mutation: trpc.partStock.create.mutate(partStockFormData as TCreatePartStock),
        onSuccess: { title: PART_STOCK_CREATED_MESSAGE },
        collection: partStockCollection,
        onSubmit,
      }),
    validators: {
      onChange: createPartStockSchema,
    },
  });

  const isLoading = useSelector(form.store, (state) => state.isSubmitting);

  return {
    form,
    formMode: FormMode.Create,
    isLoading,
    validationSchema: createPartStockSchema,
  };
}
