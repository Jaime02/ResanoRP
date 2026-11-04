import { useNavigate } from "@tanstack/react-router";
import { PlusIcon, PrinterIcon, Trash2Icon } from "lucide-react";
import { useCallback } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import NumberInput from "@/components/ui/number-input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FormContextProvider } from "@/form";
import usePartTagForm from "@/form/hooks/use-delivery-note-line-tag";
import { ACTIONS_LABEL, PRINT_LABEL, TOTAL_LABEL } from "@/messages/common";
import {
  ADD_LABEL_GROUP_LABEL,
  LABELS_LABEL,
  PRINT_LABELS_TITLE,
  UNITS_PER_LABEL_LABEL,
} from "@/messages/delivery-note";
import { FormMode } from "@/types";

interface DialogPartTagProps {
  printTagDeliveryNoteLineId?: number;
  printTagSellOrderLineId?: number;
  partQuantity?: number;
}

export default function DialogPartTag({
  printTagDeliveryNoteLineId,
  printTagSellOrderLineId,
  partQuantity,
}: DialogPartTagProps) {
  const navigate = useNavigate();

  const onClose = useCallback(
    async () =>
      navigate({
        replace: true,
        search: (prev) => ({ ...prev, printTagDeliveryNoteLineId: undefined, printTagSellOrderLineId: undefined }),
        to: ".",
      }),
    [navigate],
  );

  const { form, validationSchema } = usePartTagForm({
    deliveryNoteLineId: printTagDeliveryNoteLineId,
    sellOrderLineId: printTagSellOrderLineId,
    defaultPartQuantity: partQuantity,
    onSubmit: onClose,
  });

  return (
    <Dialog
      open={printTagDeliveryNoteLineId !== undefined || printTagSellOrderLineId !== undefined}
      onOpenChange={async (open) => !open && onClose()}
    >
      <DialogContent data-testid="dialog-tag-print-content">
        <FormContextProvider form={form as any} formMode={FormMode.Create} validationSchema={validationSchema}>
          <DialogHeader>
            <DialogTitle>{PRINT_LABELS_TITLE}</DialogTitle>
          </DialogHeader>
          <form.AppField
            name="tagGroups"
            mode="array"
            children={(field) => (
              <>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeader>{UNITS_PER_LABEL_LABEL}</TableHeader>
                      <TableHeader>{LABELS_LABEL}</TableHeader>
                      <TableHeader>{TOTAL_LABEL}</TableHeader>
                      <TableHeader>{ACTIONS_LABEL}</TableHeader>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {field.state.value.map((_, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-center">
                          <form.Field name={`tagGroups[${i}].partQuantity`}>
                            {(subField) => (
                              <NumberInput
                                value={String(subField.state.value)}
                                onChange={(e) => {
                                  subField.handleChange(Number(e.target.value));
                                }}
                              />
                            )}
                          </form.Field>
                        </TableCell>
                        <TableCell className="text-center">
                          <form.Field name={`tagGroups[${i}].tagQuantity`}>
                            {(subField) => (
                              <NumberInput
                                value={String(subField.state.value)}
                                onChange={(e) => {
                                  subField.handleChange(Number(e.target.value));
                                }}
                              />
                            )}
                          </form.Field>
                        </TableCell>
                        <TableCell className="text-right">
                          <form.Subscribe
                            selector={(state) => [state.values.tagGroups[i]] as const}
                            children={([tagGroup]) => tagGroup.partQuantity * tagGroup.tagQuantity}
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            variant="destructive"
                            size="icon"
                            onClick={() => {
                              field.removeValue(i);
                            }}
                            disabled={field.state.value.length === 1}
                          >
                            <Trash2Icon />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="flex flex-row items-center gap-2">
                  <Button
                    variant="success"
                    onClick={() => {
                      field.pushValue({ partQuantity: 0, tagQuantity: 1 });
                    }}
                    className="mx-auto w-fit"
                  >
                    <PlusIcon /> {ADD_LABEL_GROUP_LABEL}
                  </Button>
                  <form.Subscribe
                    selector={(state) => [state.values.tagGroups] as const}
                    children={([tagGroups]) => (
                      <span className="text-right font-bold">
                        Total:{" "}
                        {tagGroups.reduce((total, tagGroup) => total + tagGroup.partQuantity * tagGroup.tagQuantity, 0)}{" "}
                        unidades
                      </span>
                    )}
                  />
                </div>
              </>
            )}
          />
          <DialogFooter>
            <form.ButtonSubmit icon={<PrinterIcon />} customText={PRINT_LABEL} disableIfPristine={false} />
          </DialogFooter>
        </FormContextProvider>
      </DialogContent>
    </Dialog>
  );
}
