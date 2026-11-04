import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import MaintenanceDialog from "@/components/dialog/maintenance-dialog";
import useCreatePartFeatureForm from "@/form/hooks/use-create-part-feature";
import {
  PART_FEATURE_CREATE_TITLE,
  PART_FEATURE_LABEL,
  PART_FEATURE_MAX_VALUE_LABEL,
  PART_FEATURE_MIN_VALUE_LABEL,
} from "@/messages/part";

interface DialogCreatePartFeatureProps {
  open?: boolean;
  partId?: number;
}

export default function DialogCreatePartFeature({ open, partId }: DialogCreatePartFeatureProps) {
  const navigate = useNavigate();

  const onClose = useCallback(
    async () => navigate({ search: (prev) => ({ ...prev, createPartFeature: undefined }), to: "." }),
    [navigate],
  );

  const { form, formMode, validationSchema, isLoading } = useCreatePartFeatureForm({ partId, onSubmit: onClose });

  return (
    <MaintenanceDialog
      testId="dialog-create-part-feature"
      form={form}
      formMode={formMode}
      open={open === true && partId !== undefined}
      onClose={onClose}
      isLoading={isLoading}
      validationSchema={validationSchema}
      title={PART_FEATURE_CREATE_TITLE}
    >
      <form.AppField
        name="feature"
        children={(field) => (
          <field.TextInput
            id="input-feature-create-part-feature-dialog"
            testId="input-feature"
            label={PART_FEATURE_LABEL}
          />
        )}
      />
      <form.AppField
        name="minValue"
        children={(field) => (
          <field.DecimalInput
            id="input-min-value-create-part-feature-dialog"
            testId="input-min-value"
            label={PART_FEATURE_MIN_VALUE_LABEL}
            min={-Infinity}
            decimalScale={2}
          />
        )}
      />
      <form.AppField
        name="maxValue"
        children={(field) => (
          <field.DecimalInput
            id="input-max-value-create-part-feature-dialog"
            testId="input-max-value"
            label={PART_FEATURE_MAX_VALUE_LABEL}
            min={-Infinity}
            decimalScale={2}
          />
        )}
      />
    </MaintenanceDialog>
  );
}
