import type { LucideIcon } from "lucide-react";
import { PackageMinusIcon, PackagePlusIcon } from "lucide-react";
import { useState } from "react";

import MaintenanceDialog from "@/components/dialog/maintenance-dialog";
import MaterialLotLabel from "@/components/material-lot-label";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import FieldLabel from "@/form/components/field-label";
import FieldLayout from "@/form/components/field-layout";
import FieldLayoutContainer from "@/form/components/field-layout-container";
import useMaterialLotMovementForm from "@/form/hooks/use-material-lot-movement";
import { formatMaterialLot } from "@/lib/formatters";
import { QUANTITY_LABEL } from "@/messages/common";
import {
  MATERIAL_LOT_LABEL,
  NO_MATERIAL_LOTS_MESSAGE,
  RETURN_MATERIAL_LABEL,
  TAKE_MATERIAL_LABEL,
  ZERO_QUANTITY_HINT_MESSAGE,
} from "@/messages/material-lot";
import type { TQueryMaterialLot } from "@/queries/material-lot";
import { FormMode } from "@/types";
import { MaterialLotMovementMode } from "@/types/material-lot";

const MODE_LABELS = {
  [MaterialLotMovementMode.Take]: TAKE_MATERIAL_LABEL,
  [MaterialLotMovementMode.Return]: RETURN_MATERIAL_LABEL,
} satisfies Record<MaterialLotMovementMode, string>;

interface DialogMaterialLotMovementProps {
  mode: MaterialLotMovementMode;
  // The Lote to move when it is already known, instead of picking one from materialLots
  materialLot?: TQueryMaterialLot;
  materialLots?: Array<TQueryMaterialLot>;
  productionOrderId: number | null;
  disabled?: boolean;
  iconOnly?: boolean;
  icon?: LucideIcon;
  variant?: ButtonProps["variant"];
}

export default function DialogMaterialLotMovement({
  mode,
  materialLot,
  materialLots = materialLot !== undefined ? [materialLot] : [],
  productionOrderId,
  disabled,
  iconOnly,
  icon: Icon = mode === MaterialLotMovementMode.Take ? PackageMinusIcon : PackagePlusIcon,
  variant = mode === MaterialLotMovementMode.Take ? "destructive" : "success",
}: DialogMaterialLotMovementProps) {
  const [open, setOpen] = useState(false);
  const isQuantityOptional = mode === MaterialLotMovementMode.Take && productionOrderId !== null;
  const { form, isLoading, validationSchema } = useMaterialLotMovementForm({
    materialLotId: materialLots.length === 1 ? materialLots[0].id : null,
    mode,
    open,
    onSubmit: async () => setOpen(false),
    productionOrderId,
  });

  return (
    <>
      <Button
        testId={`button-${mode}-material`}
        variant={variant}
        size={iconOnly === true ? "icon" : undefined}
        aria-label={MODE_LABELS[mode]}
        disabled={disabled === true || materialLots.length === 0}
        onClick={() => setOpen(true)}
      >
        <Icon />
        {iconOnly !== true && MODE_LABELS[mode]}
      </Button>
      <MaintenanceDialog
        testId={`dialog-${mode}-material`}
        open={open}
        form={form}
        formMode={FormMode.Create}
        validationSchema={validationSchema}
        isLoading={isLoading}
        onClose={() => setOpen(false)}
        title={MODE_LABELS[mode]}
        layoutClassName="flex-col"
        disableSubmitIfPristine={!isQuantityOptional}
      >
        {materialLot !== undefined ? (
          <FieldLayoutContainer>
            <FieldLabel>{MATERIAL_LOT_LABEL}</FieldLabel>
            <span data-testid="material-lot">
              <MaterialLotLabel materialLot={materialLot} />
            </span>
          </FieldLayoutContainer>
        ) : (
          <form.AppField
            name="materialLotId"
            children={(field) => (
              <FieldLayout labelFor={`dialog-${mode}-material-lot`} label={MATERIAL_LOT_LABEL} required>
                <Combobox
                  id={`dialog-${mode}-material-lot`}
                  testId={`combobox-${mode}-material-lot`}
                  items={materialLots}
                  activeItem={materialLots.find((lot) => lot.id === field.state.value) ?? null}
                  formatItem={(lot) => (lot !== null ? formatMaterialLot(lot) : "")}
                  renderItem={(lot) => <MaterialLotLabel materialLot={lot} />}
                  onValueChange={(lot) => field.handleChange(lot?.id ?? null)}
                  noItemsMessage={NO_MATERIAL_LOTS_MESSAGE}
                  className="w-96"
                />
              </FieldLayout>
            )}
          />
        )}
        <form.AppField
          name="quantity"
          children={(field) => (
            <field.NumberInput
              id={`dialog-${mode}-material-quantity`}
              label={QUANTITY_LABEL}
              tooltipContent={isQuantityOptional ? ZERO_QUANTITY_HINT_MESSAGE : undefined}
            />
          )}
        />
      </MaintenanceDialog>
    </>
  );
}
