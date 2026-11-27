import { useSelector } from "@tanstack/react-store";
import { useState } from "react";

import ButtonLink from "@/components/ui/button-link";
import { useAppContext } from "@/contexts/app-context";
import { useAppForm } from "@/form";
import useResetForm from "@/form/hooks/use-reset-form";
import { useNow } from "@/lib/use-now";
import { objectToFormData } from "@/lib/utils";
import { ERROR_TITLE } from "@/messages/common";
import {
  MATERIAL_LOT_CREATED_MESSAGE,
  MATERIAL_LOT_EDITED_MESSAGE,
  MATERIAL_LOT_UNIT_WITH_MOVEMENTS_MESSAGE,
  MATERIAL_LOT_USED_BY_PRODUCTION_ORDERS_MESSAGE,
} from "@/messages/material-lot";
import { PRODUCTION_ORDER_LABEL } from "@/messages/production-order";
import { useQueryMaterialLotMovements } from "@/queries/material-lot";
import type { TQueryMaterialLot } from "@/queries/material-lot";
import { materialLotFormSchema } from "@/schemas/material-lot";
import type { TMaterialLotForm } from "@/schemas/material-lot";
import trpc from "@/trpc/trpc-client";
import { FormMode } from "@/types";
import type { MaterialLotUnit } from "@/types/material-lot";

interface UseMaterialLotFormProps {
  formMode: FormMode;
  materialId: number;
  materialLot?: TQueryMaterialLot;
  open: boolean;
  onSubmit?: () => Promise<void>;
}

export default function useMaterialLotForm({
  formMode,
  materialId,
  materialLot,
  open,
  onSubmit,
}: UseMaterialLotFormProps) {
  const { showToastOnTRPCMutation, toaster } = useAppContext();
  const now = useNow();
  const [certificate, setCertificate] = useState<File | null>(null);
  const { data: movements } = useQueryMaterialLotMovements({ materialLotId: materialLot?.id });

  const defaultValues = {
    heat: materialLot?.heat ?? null,
    id: materialLot?.id ?? null,
    materialId,
    receivedAt: materialLot?.receivedAt ?? now,
    receivedQuantity: materialLot?.receivedQuantity ?? null,
    unit: materialLot?.unit ?? (null as MaterialLotUnit | null),
  };

  const form = useAppForm({
    formId: "materialLot",
    defaultValues,
    onSubmit: async ({ value }) => {
      // The server refuses it too, this only adds the Órdenes de producción to check before changing the unit
      if (materialLot !== undefined && value.unit !== materialLot.unit && movements.length > 0) {
        const productionOrderIds = [...new Set(movements.flatMap(({ productionOrderId }) => productionOrderId ?? []))];
        toaster.error({
          description: (
            <>
              {MATERIAL_LOT_UNIT_WITH_MOVEMENTS_MESSAGE}
              {productionOrderIds.length > 0 && (
                <span className="flex flex-wrap items-center gap-2">
                  {MATERIAL_LOT_USED_BY_PRODUCTION_ORDERS_MESSAGE}
                  {productionOrderIds.map((productionOrderId) => (
                    <ButtonLink
                      key={productionOrderId}
                      testId={`button-link-production-order-${productionOrderId}`}
                      to="/production-order/$id"
                      params={{ id: productionOrderId }}
                      target="_blank"
                    >
                      {PRODUCTION_ORDER_LABEL} {productionOrderId}
                    </ButtonLink>
                  ))}
                </span>
              )}
            </>
          ),
          title: ERROR_TITLE,
        });
        return;
      }
      const formData = objectToFormData({ ...(value as TMaterialLotForm), certificate });
      await showToastOnTRPCMutation({
        mutation:
          formMode === FormMode.Create
            ? trpc.materialLot.create.mutate(formData)
            : trpc.materialLot.update.mutate(formData),
        onSuccess: { title: formMode === FormMode.Create ? MATERIAL_LOT_CREATED_MESSAGE : MATERIAL_LOT_EDITED_MESSAGE },
        onSubmit,
      });
    },
    validators: {
      onChange: materialLotFormSchema,
    },
  });

  // Each time it opens, so a new Lote does not start with the values of the last one
  useResetForm(form, defaultValues, formMode, open);

  const isLoading = useSelector(form.store, (state) => state.isSubmitting);

  return { certificate, setCertificate, form, isLoading, validationSchema: materialLotFormSchema };
}
