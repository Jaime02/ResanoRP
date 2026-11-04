import { PackageOpenIcon } from "lucide-react";
import { useState } from "react";

import TablePartTransactions from "@/components/table/part-transactions";
import DateInput from "@/components/ui/date-input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import NumberInput from "@/components/ui/number-input";
import { Separator } from "@/components/ui/separator";
import { FormContextProvider } from "@/form";
import FieldLabel from "@/form/components/field-label";
import FieldLayoutContainer from "@/form/components/field-layout-container";
import useCreatePartStockForm from "@/form/hooks/use-create-part-stock";
import { DATE_LABEL, UNKNOWN_LABEL, UPDATE_LABEL } from "@/messages/common";
import { PART_STOCK_CURRENT_LABEL, PART_STOCK_UPDATE_QUANTITY_LABEL } from "@/messages/part";
import type { TPartForm, TPartStockRecord } from "@/queries/part";

interface DialogPartStockProps extends React.ComponentProps<typeof Dialog> {
  testId?: string;
  part: TPartForm;
  partStockTransactions: Array<TPartStockRecord>;
}

export default function DialogPartStock({
  testId = "dialog-part-stock",
  part,
  partStockTransactions,
  ...props
}: DialogPartStockProps) {
  const [isOpen, setIsOpen] = useState(false);

  const currentPartStock = partStockTransactions.at(0);

  const { form, formMode, isLoading, validationSchema } = useCreatePartStockForm({
    onSubmit: async () => setIsOpen(false),
    partId: part.id,
  });

  return (
    <Dialog {...props} open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger data-testid="dialog-part-stock-trigger" variant="secondary" size="icon">
        <PackageOpenIcon />
      </DialogTrigger>
      <DialogContent data-testid={testId} isLoading={isLoading}>
        <FormContextProvider form={form} formMode={formMode} isLoading={isLoading} validationSchema={validationSchema}>
          <DialogHeader>
            <DialogTitle>Inventario del Artículo "{part.description}"</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <TablePartTransactions partId={part.id} rows={partStockTransactions} isLoading={isLoading} />
            <Separator />
            <div className="flex flex-row gap-3">
              <FieldLayoutContainer>
                <FieldLabel>{PART_STOCK_CURRENT_LABEL}</FieldLabel>
                <NumberInput
                  value={currentPartStock !== undefined ? currentPartStock.finalQuantity.toString() : null}
                  readOnly
                  placeholder={UNKNOWN_LABEL}
                />
              </FieldLayoutContainer>
              <FieldLayoutContainer>
                <FieldLabel>{DATE_LABEL}</FieldLabel>
                <DateInput
                  date={
                    currentPartStock !== undefined
                      ? new Date(
                          currentPartStock.transaction.__typename === "DeliveryNoteLine"
                            ? currentPartStock.transaction.deliveryNote.createdAt
                            : currentPartStock.transaction.date,
                        )
                      : null
                  }
                  disabled
                  emptyMessage={UNKNOWN_LABEL}
                />
              </FieldLayoutContainer>
              <Separator orientation="vertical" />
              <form.AppField
                name="quantity"
                children={(field) => (
                  <field.NumberInput id="dialog-create-part-stock-quantity" label={PART_STOCK_UPDATE_QUANTITY_LABEL} />
                )}
              />
            </div>
          </div>
          <DialogFooter>
            <form.ButtonSubmit customText={UPDATE_LABEL} />
          </DialogFooter>
        </FormContextProvider>
      </DialogContent>
    </Dialog>
  );
}
