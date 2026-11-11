import type { AnyFieldApi } from "@tanstack/react-form";
import { useSelector } from "@tanstack/react-store";
import { useMemo } from "react";

import { useAppContext } from "@/contexts/app-context";
import { useAppForm } from "@/form";
import useResetForm from "@/form/hooks/use-reset-form";
import { getEstimation, roundPrice } from "@/lib/part-price-estimator";
import { PRICE_SAVED_MESSAGE } from "@/messages/part-price";
import type { TPartForm } from "@/queries/part";
import { useQueryPartPriceEstimator } from "@/queries/part-price-estimator";
import type { TPartPriceEstimationForm, TUpdatePartPriceEstimator } from "@/schemas/part-price-estimator";
import { partPriceEstimationFormSchema, partPriceEstimatorSchema } from "@/schemas/part-price-estimator";
import trpc from "@/trpc/trpc-client";

const defaultPartPriceEstimatorFormData = {
  coatingCost: null,
  machinePricePerHour: null,
  machineSetupTimeMinutes: null,
  materialCost: null,
  partsPerHour: null,
  otherCost: null,
  secondOperationCost: null,
  transportPercentage: "2",
  unexpectedPercentage: "1",
  wastePercentage: "2",
};

interface UsePartPriceEstimatorFormProps {
  partId: number;
  part?: TPartForm;
  isLoadingPart: boolean;
}

export default function usePartPriceEstimatorForm({ partId, part, isLoadingPart }: UsePartPriceEstimatorFormProps) {
  const { showToastOnTRPCMutation } = useAppContext();

  const { data: estimator, isLoading: isLoadingEstimator } = useQueryPartPriceEstimator({ partId });

  const pendingPartPrices = useMemo(() => part?.prices.filter((partPrice) => partPrice.price === null), [part]);

  const saveEstimator = (field: AnyFieldApi, values: unknown) => {
    if (!(field.name in partPriceEstimatorSchema.shape) || !field.state.meta.isDirty) return;
    const { success } = partPriceEstimatorSchema.safeParse(values);
    if (!success) return;
    void showToastOnTRPCMutation({
      mutation: trpc.partPriceEstimator.update.mutate(values as TUpdatePartPriceEstimator),
    });
  };

  const form = useAppForm({
    formId: "partPriceEstimator",
    defaultValues: {
      partId,
      coatingCost: estimator?.coatingCost ?? defaultPartPriceEstimatorFormData.coatingCost,
      machinePricePerHour: estimator?.machinePricePerHour ?? defaultPartPriceEstimatorFormData.machinePricePerHour,
      machineSetupTimeMinutes:
        estimator?.machineSetupTimeMinutes ?? defaultPartPriceEstimatorFormData.machineSetupTimeMinutes,
      materialCost: estimator?.materialCost ?? defaultPartPriceEstimatorFormData.materialCost,
      materialId: estimator?.materialId ?? part?.materials.at(0)?.id ?? null,
      partLength: estimator?.partLength ?? part?.length ?? null,
      partsPerHour: estimator?.partsPerHour ?? defaultPartPriceEstimatorFormData.partsPerHour,
      otherCost: estimator?.otherCost ?? defaultPartPriceEstimatorFormData.otherCost,
      secondOperationCost: estimator?.secondOperationCost ?? defaultPartPriceEstimatorFormData.secondOperationCost,
      transportPercentage: estimator
        ? estimator.transportPercentage
        : defaultPartPriceEstimatorFormData.transportPercentage,
      unexpectedPercentage: estimator
        ? estimator.unexpectedPercentage
        : defaultPartPriceEstimatorFormData.unexpectedPercentage,
      wastePercentage: estimator?.wastePercentage ?? defaultPartPriceEstimatorFormData.wastePercentage,
      clientId: pendingPartPrices?.at(0)?.clientId ?? null,
      partPriceId: pendingPartPrices?.at(0)?.id ?? null,
      quantity: pendingPartPrices?.at(0)?.quantity ?? null,
    },
    listeners: {
      onBlur: ({ formApi, fieldApi }) => saveEstimator(fieldApi, formApi.state.values),
      // The material combobox does not blur the field
      onChange: ({ formApi, fieldApi }) => {
        if (fieldApi.name === "materialId") saveEstimator(fieldApi, formApi.state.values);
      },
    },
    onSubmit: async ({ value }) => {
      const { clientId, partPriceId, quantity, ...estimatorFormData } = value as TPartPriceEstimationForm;
      const material = part?.materials.find((partMaterial) => partMaterial.id === estimatorFormData.materialId);
      const { basePrice } = getEstimation(estimatorFormData, material, quantity);
      if (basePrice === null) return;
      const price = roundPrice(basePrice);
      const pendingPartPrice = pendingPartPrices?.find((partPrice) => partPrice.id === partPriceId);
      await showToastOnTRPCMutation({
        mutation: pendingPartPrice
          ? trpc.partPrice.update.mutate({
              clientId,
              createdAt: pendingPartPrice.createdAt,
              id: pendingPartPrice.id,
              price,
              quantity,
            })
          : trpc.partPrice.create.mutate({ clientId, createdAt: new Date(), partId, price, quantity }),
        onSuccess: { title: PRICE_SAVED_MESSAGE },
      });
    },
    validators: {
      onSubmit: partPriceEstimationFormSchema,
    },
  });

  const isSubmitting = useSelector(form.store, (state) => state.isSubmitting);

  // Not on every estimator change: its own saves would reset the fields being edited
  useResetForm(form, isLoadingEstimator, part?.id, pendingPartPrices?.length);

  return {
    form,
    validationSchema: partPriceEstimationFormSchema,
    part,
    pendingPartPrices,
    isLoading: isLoadingPart || isLoadingEstimator || isSubmitting,
  };
}
