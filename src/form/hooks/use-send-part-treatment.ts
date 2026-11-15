import { useSelector } from "@tanstack/react-store";

import { useAppContext } from "@/contexts/app-context";
import { useAppForm } from "@/form";
import { PARTS_SENT_TO_TREATMENT_MESSAGE } from "@/messages/treatment";
import { sendPartTreatmentSchema } from "@/schemas/treatment";
import type { TSendPartTreatment } from "@/schemas/treatment";
import trpc from "@/trpc/trpc-client";
import { FormMode } from "@/types";

interface UseSendPartTreatmentFormProps {
  onSubmit?: () => Promise<void>;
}

export default function useSendPartTreatmentForm({ onSubmit }: UseSendPartTreatmentFormProps = {}) {
  const { showToastOnTRPCMutation } = useAppContext();

  const form = useAppForm({
    formId: "sendPartTreatment",
    defaultValues: {
      partId: null as number | null,
      quantity: null as number | null,
    },
    onSubmit: async ({ value: sendPartTreatmentFormData }) =>
      showToastOnTRPCMutation({
        mutation: trpc.treatment.sendPart.mutate(sendPartTreatmentFormData as TSendPartTreatment),
        onSuccess: { title: PARTS_SENT_TO_TREATMENT_MESSAGE },
        onSubmit,
      }),
    validators: {
      onChange: sendPartTreatmentSchema,
    },
  });

  const isLoading = useSelector(form.store, (state) => state.isSubmitting);

  return {
    form,
    formMode: FormMode.Create,
    isLoading,
    validationSchema: sendPartTreatmentSchema,
  };
}
