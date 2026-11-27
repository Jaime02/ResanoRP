import { useSelector } from "@tanstack/react-store";

import { useAppContext } from "@/contexts/app-context";
import { useAppForm } from "@/form";
import useResetForm from "@/form/hooks/use-reset-form";
import { resetForm } from "@/form/utils";
import { PRINTER_CREATED_MESSAGE, PRINTER_EDITED_MESSAGE } from "@/messages/printer";
import { useQueryPrinterById } from "@/queries/printer";
import { createPrinterSchema, updatePrinterSchema } from "@/schemas/printer";
import type { TCreatePrinter, TUpdatePrinter } from "@/schemas/printer";
import trpc from "@/trpc/trpc-client";
import { FormMode } from "@/types";
import { PrinterKind } from "@/types/printer";
import type { TPublicPrinter } from "@/types/printer";

const defaultPrinterFormData: {
  name: string | null;
  kind: PrinterKind;
  address: string | null;
  shareName: string | null;
  username: string | null;
  labelWidthMm: number | null;
  labelLengthMm: number | null;
  forTags: boolean;
} = {
  address: null,
  forTags: false,
  kind: PrinterKind.Ipp,
  labelLengthMm: null,
  labelWidthMm: null,
  name: null,
  shareName: null,
  username: null,
};

const schemas = {
  [FormMode.Create]: createPrinterSchema,
  [FormMode.Update]: updatePrinterSchema,
  [FormMode.ReadOnly]: undefined,
  [FormMode.NotApplicable]: undefined,
};

interface UsePrinterFormProps {
  formMode: FormMode;
  editPrinterId?: number;
  onSubmit?: (printer: TPublicPrinter) => Promise<void>;
}

export default function usePrinterForm({ formMode, editPrinterId, onSubmit }: UsePrinterFormProps) {
  const { showToastOnTRPCMutation } = useAppContext();

  const { data: printer, isLoading: isLoadingPrinter, isLoadingError, isCrashed } = useQueryPrinterById(editPrinterId);

  const validationSchema = schemas[formMode];

  const defaultValues = {
    ...(formMode !== FormMode.Create ? { id: printer?.id } : {}),
    address: formMode === FormMode.Create ? defaultPrinterFormData.address : (printer?.address ?? null),
    forTags: formMode === FormMode.Create ? defaultPrinterFormData.forTags : (printer?.forTags ?? false),
    kind: formMode === FormMode.Create ? defaultPrinterFormData.kind : (printer?.kind ?? defaultPrinterFormData.kind),
    labelLengthMm:
      formMode === FormMode.Create ? defaultPrinterFormData.labelLengthMm : (printer?.labelLengthMm ?? null),
    labelWidthMm: formMode === FormMode.Create ? defaultPrinterFormData.labelWidthMm : (printer?.labelWidthMm ?? null),
    name: formMode === FormMode.Create ? defaultPrinterFormData.name : (printer?.name ?? null),
    // The stored password never reaches the browser, so it starts empty, which keeps it
    password: null as string | null,
    shareName: formMode === FormMode.Create ? defaultPrinterFormData.shareName : (printer?.shareName ?? null),
    username: formMode === FormMode.Create ? defaultPrinterFormData.username : (printer?.username ?? null),
  };

  const form = useAppForm({
    formId: "printer",
    defaultValues,
    onSubmit: async ({ value: printerFormData, formApi }) => {
      if (formMode !== FormMode.Create && formMode !== FormMode.Update) return;
      const mutation =
        formMode === FormMode.Create
          ? trpc.printer.create.mutate(printerFormData as TCreatePrinter)
          : trpc.printer.update.mutate(printerFormData as TUpdatePrinter);
      await showToastOnTRPCMutation({
        mutation,
        onSuccess: {
          title: formMode === FormMode.Create ? PRINTER_CREATED_MESSAGE : PRINTER_EDITED_MESSAGE,
        },
        onSubmit: async (item) => {
          await onSubmit?.(item);
          if (formMode === FormMode.Create) resetForm(formApi);
        },
      });
    },
    validators: {
      onChange: validationSchema,
    },
  });

  const isSubmitting = useSelector(form.store, (state) => state.isSubmitting);

  useResetForm(form, defaultValues, formMode);

  const isLoading = isLoadingPrinter || isSubmitting;

  return {
    printer,
    validationSchema,
    form,
    formMode,
    getPrinterByIdError:
      isLoadingError || isCrashed || (editPrinterId !== undefined && !isLoadingPrinter && printer === undefined),
    isLoading,
  };
}

export type TPrinterForm = NonNullable<ReturnType<typeof usePrinterForm>["printer"]>;
