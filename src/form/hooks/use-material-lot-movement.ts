import { useSelector } from "@tanstack/react-store";

import { useAppContext } from "@/contexts/app-context";
import { useAppForm } from "@/form";
import useResetForm from "@/form/hooks/use-reset-form";
import { MATERIAL_RETURNED_MESSAGE, MATERIAL_TAKEN_MESSAGE } from "@/messages/material-lot";
import { getMaterialLotMovementFormSchema } from "@/schemas/material-lot";
import trpc from "@/trpc/trpc-client";
import { MaterialLotMovementMode } from "@/types/material-lot";

interface UseMaterialLotMovementFormProps {
  mode: MaterialLotMovementMode;
  materialLotId: number | null;
  productionOrderId: number | null;
  open: boolean;
  onSubmit?: () => Promise<void>;
}

export default function useMaterialLotMovementForm({
  mode,
  materialLotId,
  productionOrderId,
  open,
  onSubmit,
}: UseMaterialLotMovementFormProps) {
  const { showToastOnTRPCMutation } = useAppContext();
  const validationSchema = getMaterialLotMovementFormSchema(mode, productionOrderId);

  const form = useAppForm({
    formId: `materialLotMovement-${mode}`,
    defaultValues: { materialLotId, quantity: null as number | null },
    onSubmit: async ({ value }) => {
      const { materialLotId: submittedMaterialLotId, quantity: typedQuantity } = validationSchema.parse(value);
      const quantity = typedQuantity ?? 0;
      await showToastOnTRPCMutation({
        mutation: trpc.materialLot.move.mutate({
          materialLotId: submittedMaterialLotId,
          productionOrderId,
          quantity: mode === MaterialLotMovementMode.Take ? -quantity : quantity,
        }),
        onSuccess: {
          title: mode === MaterialLotMovementMode.Take ? MATERIAL_TAKEN_MESSAGE : MATERIAL_RETURNED_MESSAGE,
        },
        onSubmit,
      });
    },
    validators: {
      onChange: validationSchema,
    },
  });

  // Each time it opens, so a movement does not start with the quantity of the last one
  useResetForm(form, materialLotId, productionOrderId, open);

  const isLoading = useSelector(form.store, (state) => state.isSubmitting);

  return { form, isLoading, validationSchema };
}
