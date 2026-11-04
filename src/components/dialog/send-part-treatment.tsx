import { SendIcon } from "lucide-react";
import { useState } from "react";

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FormContextProvider } from "@/form";
import useSendPartTreatmentForm from "@/form/hooks/use-send-part-treatment";
import { PART_LABEL, QUANTITY_LABEL } from "@/messages/common";
import { SEND_LABEL, SEND_PART_TO_TREATMENT_WITHOUT_ORDER_TITLE, SEND_WITHOUT_ORDER_LABEL } from "@/messages/treatment";
import type { TPartFilters } from "@/schemas/part";
import { TablePartPickerMode } from "@/types";

const COATED_PART_FILTERS: TPartFilters = [{ id: "hasCoating", value: true }];

export default function DialogSendPartTreatment() {
  const [isOpen, setIsOpen] = useState(false);

  const { form, formMode, isLoading, validationSchema } = useSendPartTreatmentForm({
    onSubmit: async () => setIsOpen(false),
  });

  const onOpenChange = (open: boolean) => {
    setIsOpen(open);
    form.reset();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogTrigger data-testid="button-send-part-treatment" variant="secondary">
        <SendIcon /> {SEND_WITHOUT_ORDER_LABEL}
      </DialogTrigger>
      <DialogContent data-testid="dialog-send-part-treatment" isLoading={isLoading}>
        <FormContextProvider form={form} formMode={formMode} isLoading={isLoading} validationSchema={validationSchema}>
          <DialogHeader>
            <DialogTitle>{SEND_PART_TO_TREATMENT_WITHOUT_ORDER_TITLE}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-row items-end gap-3">
            <form.AppField
              name="partId"
              children={(field) => (
                <field.PickerPart
                  id="picker-send-part-treatment"
                  testId="picker-send-part-treatment"
                  label={PART_LABEL}
                  pickerMode={TablePartPickerMode.PickParts}
                  defaultFilters={COATED_PART_FILTERS}
                  onRowSelect={(row) => field.handleChange(row?.partId ?? null)}
                />
              )}
            />
            <form.AppField
              name="quantity"
              children={(field) => (
                <field.NumberInput
                  id="input-send-part-treatment-quantity"
                  testId="input-send-part-treatment-quantity"
                  label={QUANTITY_LABEL}
                />
              )}
            />
          </div>
          <DialogFooter>
            <form.ButtonSubmit
              testId="button-confirm-send-part-treatment"
              icon={<SendIcon />}
              customText={SEND_LABEL}
            />
          </DialogFooter>
        </FormContextProvider>
      </DialogContent>
    </Dialog>
  );
}
