import { useSelector } from "@tanstack/react-store";

import { useAppContext } from "@/contexts/app-context";
import { useAppForm } from "@/form";
import useResetForm from "@/form/hooks/use-reset-form";
import { useNow } from "@/lib/use-now";
import { PART_PRICE_CREATED_MESSAGE, PART_PRICE_EDITED_MESSAGE } from "@/messages/part-price";
import type { TPartPriceForm } from "@/queries/part";
import { useQueryPartPrice } from "@/queries/part-price";
import type { TCreatePartPrice, TUpdatePartPrice } from "@/schemas/part-price";
import { createPartPriceSchema, updatePartPriceSchema } from "@/schemas/part-price";
import trpc from "@/trpc/trpc-client";
import { FormMode } from "@/types";
import type { BasePartPriceSerialized } from "@/types/part-price";

const defaultPartPriceFormData = {
  clientId: null,
  price: null,
  quantity: null,
};

const schemas = {
  [FormMode.Create]: createPartPriceSchema,
  [FormMode.Update]: updatePartPriceSchema,
  [FormMode.ReadOnly]: undefined,
  [FormMode.NotApplicable]: undefined,
};

type UsePartPriceFormProps = {
  requestedFormMode: FormMode;
  editingPartId?: number;
  defaultClientId?: number | null;
  onSubmit?: (partPrice: BasePartPriceSerialized) => Promise<void>;
} & (
  | { controlledPartPrice?: TPartPriceForm; editPartPriceId?: never }
  | { editPartPriceId?: number; controlledPartPrice?: never }
);

export default function usePartPriceForm({
  requestedFormMode,
  editPartPriceId,
  controlledPartPrice,
  editingPartId,
  defaultClientId = defaultPartPriceFormData.clientId,
  onSubmit,
}: UsePartPriceFormProps) {
  const { showToastOnTRPCMutation } = useAppContext();

  const {
    data: queryPartPrice,
    isLoading: isLoadingPartPrice,
    isLoadingError,
    isCrashed,
  } = useQueryPartPrice({
    partPriceId: editPartPriceId,
    skip: controlledPartPrice !== undefined || ![FormMode.Update, FormMode.ReadOnly].includes(requestedFormMode),
  });
  const partPrice = controlledPartPrice ?? queryPartPrice;
  const formMode = requestedFormMode;

  const validationSchema = schemas[formMode];

  const now = useNow();

  const defaultValues = {
    ...(formMode !== FormMode.Create ? { id: partPrice?.id } : {}),
    ...(formMode === FormMode.Create ? { partId: editingPartId } : {}),
    clientId: formMode === FormMode.Create ? defaultClientId : (partPrice?.clientId ?? null),
    createdAt: formMode === FormMode.Create ? now : partPrice?.createdAt ? new Date(partPrice.createdAt) : null,
    price: formMode === FormMode.Create ? defaultPartPriceFormData.price : (partPrice?.price ?? null),
    quantity: formMode === FormMode.Create ? defaultPartPriceFormData.quantity : (partPrice?.quantity ?? null),
  };

  const form = useAppForm({
    formId: "partPrice",
    defaultValues,
    onSubmit: async ({ value: partPriceFormData }) => {
      if (formMode !== FormMode.Create && formMode !== FormMode.Update) return;
      const mutation =
        formMode === FormMode.Create
          ? trpc.partPrice.create.mutate(partPriceFormData as TCreatePartPrice)
          : trpc.partPrice.update.mutate(partPriceFormData as TUpdatePartPrice);
      await showToastOnTRPCMutation({
        mutation,
        onSuccess: { title: formMode === FormMode.Create ? PART_PRICE_CREATED_MESSAGE : PART_PRICE_EDITED_MESSAGE },
        onSubmit,
      });
    },
    validators: {
      // @ts-expect-error
      onSubmit: validationSchema,
    },
  });

  const isSubmitting = useSelector(form.store, (state) => state.isSubmitting);

  useResetForm(form, defaultValues, formMode);

  const isLoading = isLoadingPartPrice || isSubmitting;

  return {
    validationSchema,
    form,
    getPartPriceByIdQueryError:
      isLoadingError || isCrashed || (editPartPriceId !== undefined && !isLoadingPartPrice && partPrice === undefined),
    isLoading,
    partPrice,
  };
}
