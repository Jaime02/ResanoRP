import { useSelector } from "@tanstack/react-store";

import { useFormContext } from "@/form";
import { NAME_LABEL } from "@/messages/common";
import {
  MILLIMETERS_SUFFIX,
  PRINTER_ADDRESS_LABEL,
  PRINTER_FOR_TAGS_LABEL,
  PRINTER_LABEL_LENGTH_LABEL,
  PRINTER_LABEL_WIDTH_LABEL,
  PRINTER_PASSWORD_LABEL,
  PRINTER_PASSWORD_UNCHANGED_PLACEHOLDER,
  PRINTER_SHARE_NAME_LABEL,
  PRINTER_USERNAME_LABEL,
} from "@/messages/printer";
import { FormMode } from "@/types";
import { isLabelPrinterKind, isSharePrinterKind } from "@/types/printer";
import type { PrinterKind } from "@/types/printer";

export default function FormPrinter() {
  const { form, formMode } = useFormContext();
  const kind = useSelector(form.store, (state) => state.values.kind as PrinterKind | null);

  return (
    <>
      <form.AppField
        name="name"
        children={(field) => <field.TextInput id="dialog-create-edit-printer-name" label={NAME_LABEL} />}
      />
      <form.AppField
        name="kind"
        children={(field) => <field.PrinterKindCombobox id="dialog-create-edit-printer-kind" />}
      />
      <form.AppField
        name="address"
        children={(field) => <field.TextInput id="dialog-create-edit-printer-address" label={PRINTER_ADDRESS_LABEL} />}
      />
      <form.AppField
        name="forTags"
        children={(field) => <field.Checkbox id="dialog-create-edit-printer-for-tags" label={PRINTER_FOR_TAGS_LABEL} />}
      />
      {isSharePrinterKind(kind) && (
        <>
          <form.AppField
            name="shareName"
            children={(field) => (
              <field.TextInput id="dialog-create-edit-printer-share-name" label={PRINTER_SHARE_NAME_LABEL} />
            )}
          />
          <form.AppField
            name="username"
            children={(field) => (
              <field.TextInput
                id="dialog-create-edit-printer-username"
                label={PRINTER_USERNAME_LABEL}
                autoComplete="off"
              />
            )}
          />
          <form.AppField
            name="password"
            children={(field) => (
              <field.TextInput
                id="dialog-create-edit-printer-password"
                label={PRINTER_PASSWORD_LABEL}
                type="password"
                autoComplete="new-password"
                placeholder={formMode === FormMode.Update ? PRINTER_PASSWORD_UNCHANGED_PLACEHOLDER : undefined}
              />
            )}
          />
        </>
      )}
      {isLabelPrinterKind(kind) && (
        <>
          <form.AppField
            name="labelWidthMm"
            children={(field) => (
              <field.NumberInput
                id="dialog-create-edit-printer-label-width"
                label={PRINTER_LABEL_WIDTH_LABEL}
                suffix={MILLIMETERS_SUFFIX}
              />
            )}
          />
          <form.AppField
            name="labelLengthMm"
            children={(field) => (
              <field.NumberInput
                id="dialog-create-edit-printer-label-length"
                label={PRINTER_LABEL_LENGTH_LABEL}
                suffix={MILLIMETERS_SUFFIX}
              />
            )}
          />
        </>
      )}
    </>
  );
}
