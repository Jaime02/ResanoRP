import { PlusIcon } from "lucide-react";
import { useMemo, useState } from "react";

import BaseTable from "@/components/table/base-table";
import { createTableColumnHelper } from "@/components/table/column-helper";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FormContextProvider } from "@/form";
import useCreateQualityCheckForm from "@/form/hooks/use-create-quality-check";
import { NOTES_LABEL, SAVE_LABEL } from "@/messages/common";
import { PART_FEATURE_LABEL, PART_FEATURE_MAX_VALUE_LABEL, PART_FEATURE_MIN_VALUE_LABEL } from "@/messages/part";
import {
  NEW_QUALITY_CHECK_TITLE,
  QUALITY_CHECK_MEASUREMENT_LABEL,
  REGISTER_QUALITY_CHECK_LABEL,
  UNITS_PRODUCED_LABEL,
} from "@/messages/production-order";

interface TQualityCheckFeature {
  id: number;
  feature: string;
  minValue: string | null;
  maxValue: string | null;
}

const columnHelper = createTableColumnHelper<TQualityCheckFeature>();

interface DialogQualityCheckProps {
  productionOrderId: number;
  partFeatures: Array<TQualityCheckFeature>;
}

export default function DialogQualityCheck({ productionOrderId, partFeatures }: DialogQualityCheckProps) {
  const [isOpen, setIsOpen] = useState(false);

  const { form, formMode, isLoading, validationSchema } = useCreateQualityCheckForm({
    onSubmit: async () => setIsOpen(false),
    partFeatureIds: partFeatures.map(({ id }) => id),
    productionOrderId,
  });

  const onOpenChange = (open: boolean) => {
    setIsOpen(open);
    form.reset();
  };

  const columns = useMemo(
    () => [
      columnHelper.accessor("feature", { header: PART_FEATURE_LABEL, id: "feature" }),
      columnHelper.accessor("minValue", { header: PART_FEATURE_MIN_VALUE_LABEL, id: "minValue" }),
      columnHelper.accessor("maxValue", { header: PART_FEATURE_MAX_VALUE_LABEL, id: "maxValue" }),
      columnHelper.display({
        cell: ({ row: { original, index } }) =>
          original.minValue !== null || original.maxValue !== null ? (
            <form.AppField
              name={`results[${index}].value`}
              children={(field) => (
                <field.DecimalInput
                  id={`input-quality-check-value-${original.id}`}
                  testId={`input-quality-check-value-${original.id}`}
                  decimalScale={2}
                  min={-Infinity}
                />
              )}
            />
          ) : (
            <form.AppField
              name={`results[${index}].ok`}
              children={(field) => <field.Checkbox id={`checkbox-quality-check-${original.id}`} showUncheckedIcon />}
            />
          ),
        header: QUALITY_CHECK_MEASUREMENT_LABEL,
        id: "result",
      }),
      columnHelper.display({
        cell: ({ row: { original, index } }) => (
          <form.AppField
            name={`results[${index}].notes`}
            children={(field) => (
              <field.TextInput
                id={`input-quality-check-notes-${original.id}`}
                testId={`input-quality-check-notes-${original.id}`}
              />
            )}
          />
        ),
        header: NOTES_LABEL,
        id: "notes",
      }),
    ],
    [form],
  );

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogTrigger data-testid="button-quality-check-create" variant="success" disabled={partFeatures.length === 0}>
        <PlusIcon /> {REGISTER_QUALITY_CHECK_LABEL}
      </DialogTrigger>
      <DialogContent data-testid="dialog-quality-check-create" isLoading={isLoading}>
        <FormContextProvider
          form={form as any}
          formMode={formMode}
          isLoading={isLoading}
          validationSchema={validationSchema}
        >
          <DialogHeader>
            <DialogTitle>{NEW_QUALITY_CHECK_TITLE}</DialogTitle>
          </DialogHeader>
          <form.AppField
            name="producedQuantity"
            children={(field) => (
              <field.NumberInput
                id="input-quality-check-quantity"
                testId="input-quality-check-quantity"
                label={UNITS_PRODUCED_LABEL}
              />
            )}
          />
          <BaseTable testId="table-quality-check-features" title={null} columns={columns} rows={partFeatures} />
          <DialogFooter>
            <form.ButtonSubmit testId="button-confirm-quality-check" customText={SAVE_LABEL} />
          </DialogFooter>
        </FormContextProvider>
      </DialogContent>
    </Dialog>
  );
}
