import { useDbClient } from "@tanstack/react-db";
import { HistoryIcon, PlusIcon } from "lucide-react";
import { useId, useMemo, useState } from "react";

import materialLotCollection from "@/collections/material-lot";
import MaintenanceDialog from "@/components/dialog/maintenance-dialog";
import DialogMaterialLotMovement from "@/components/dialog/material-lot-movement";
import ShapeIcon from "@/components/icons/shape";
import BaseTable from "@/components/table/base-table";
import { createTableColumnHelper } from "@/components/table/column-helper";
import TableMaterialLotMovements, { MaterialCertificateLink } from "@/components/table/material-lot-movements";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Dropzone } from "@/components/ui/dropzone";
import { ModelActions } from "@/components/ui/model-actions";
import { useAppContext } from "@/contexts/app-context";
import FieldLabel from "@/form/components/field-label";
import FieldLayoutContainer from "@/form/components/field-layout-container";
import useMaterialLotForm from "@/form/hooks/use-material-lot";
import { formatDate } from "@/lib/formatters";
import { serializeMaterialLot } from "@/lib/serializers";
import { ACTIONS_LABEL } from "@/messages/common";
import {
  HEAT_LABEL,
  MATERIAL_LOT_CERTIFICATE_LABEL,
  MATERIAL_LOT_CREATE_TITLE,
  MATERIAL_LOT_DELETE_MESSAGE,
  MATERIAL_LOT_DELETE_TITLE,
  MATERIAL_LOT_DELETED_MESSAGE,
  MATERIAL_LOT_EDIT_TITLE,
  MATERIAL_LOT_MOVEMENTS_TITLE,
  MATERIAL_LOT_RECEIVED_AT_LABEL,
  MATERIAL_LOT_RECEIVED_QUANTITY_LABEL,
  MATERIAL_LOT_REMAINING_LABEL,
  MATERIAL_LOT_UNIT_LABELS,
  MATERIAL_LOT_UNIT_LABEL,
  MATERIAL_LOTS_TITLE,
  NO_MATERIAL_LOTS_MESSAGE,
  SHOW_USED_UP_MATERIAL_LOTS_LABEL,
} from "@/messages/material-lot";
import type { TQueryMaterialLot } from "@/queries/material-lot";
import { useQueryMaterialLotMovements, useQueryMaterialLots } from "@/queries/material-lot";
import { FormMode } from "@/types";
import { MaterialLotMovementMode } from "@/types/material-lot";

function DialogMaterialLotForm({
  materialId,
  materialLot,
  open,
  onClose,
}: {
  materialId: number;
  materialLot?: TQueryMaterialLot;
  open: boolean;
  onClose: () => void;
}) {
  const formMode = materialLot === undefined ? FormMode.Create : FormMode.Update;
  const { certificate, setCertificate, form, isLoading, validationSchema } = useMaterialLotForm({
    formMode,
    materialId,
    materialLot,
    open,
    onSubmit: async () => close(),
  });
  const certificateInputId = useId();

  function close() {
    setCertificate(null);
    onClose();
  }

  return (
    <MaintenanceDialog
      testId="dialog-create-edit-material-lot"
      open={open}
      form={form}
      formMode={formMode}
      validationSchema={validationSchema}
      isLoading={isLoading}
      disableSubmitIfPristine={certificate === null}
      onClose={close}
      title={formMode === FormMode.Create ? MATERIAL_LOT_CREATE_TITLE : MATERIAL_LOT_EDIT_TITLE}
      layoutClassName="flex-col"
    >
      <form.AppField
        name="heat"
        children={(field) => <field.TextInput id="dialog-material-lot-heat" label={HEAT_LABEL} />}
      />
      <form.AppField
        name="unit"
        children={(field) => <field.MaterialLotUnitCombobox id="dialog-material-lot-unit" />}
      />
      <form.AppField
        name="receivedQuantity"
        children={(field) => (
          <field.NumberInput id="dialog-material-lot-received-quantity" label={MATERIAL_LOT_RECEIVED_QUANTITY_LABEL} />
        )}
      />
      <form.AppField
        name="receivedAt"
        children={(field) => (
          <field.DateInput id="dialog-material-lot-received-at" label={MATERIAL_LOT_RECEIVED_AT_LABEL} />
        )}
      />
      <FieldLayoutContainer>
        <FieldLabel labelFor={certificateInputId}>{MATERIAL_LOT_CERTIFICATE_LABEL}</FieldLabel>
        <Dropzone
          id={certificateInputId}
          testId="dropzone-material-lot-certificate"
          filterFieldName="certificate"
          accept={{ "application/pdf": [] }}
          src={certificate}
          onDrop={(acceptedFiles) => setCertificate(acceptedFiles[0])}
          onClear={() => setCertificate(null)}
          disabled={isLoading}
        />
      </FieldLayoutContainer>
    </MaintenanceDialog>
  );
}

function DialogMaterialLotMovements({
  materialLot,
  onClose,
}: {
  materialLot?: TQueryMaterialLot;
  onClose: () => void;
}) {
  const { data: movements, isLoading } = useQueryMaterialLotMovements({ materialLotId: materialLot?.id });

  return (
    <Dialog open={materialLot !== undefined} onOpenChange={(open) => !open && onClose()}>
      <DialogContent data-testid="dialog-material-lot-movements">
        <DialogHeader>
          <DialogTitle>
            {MATERIAL_LOT_MOVEMENTS_TITLE} {materialLot?.heat}
          </DialogTitle>
        </DialogHeader>
        {materialLot !== undefined && <TableMaterialLotMovements rows={movements} isLoading={isLoading} />}
      </DialogContent>
    </Dialog>
  );
}

const columnHelper = createTableColumnHelper<TQueryMaterialLot>();

interface DialogMaterialLotsProps {
  material?: { id: number; name: string; shapeName?: string | null };
  onClose: () => void;
}

export default function DialogMaterialLots({ material, onClose }: DialogMaterialLotsProps) {
  const dbClient = useDbClient();
  const { showToastOnTransaction } = useAppContext();
  const showUsedUpCheckboxId = useId();
  const [showUsedUp, setShowUsedUp] = useState(false);
  const [formMaterialLot, setFormMaterialLot] = useState<TQueryMaterialLot | null | undefined>(undefined);
  const [movementsMaterialLotId, setMovementsMaterialLotId] = useState<number | undefined>(undefined);

  const { data: materialLots, isLoading } = useQueryMaterialLots({
    materialIds: material !== undefined ? [material.id] : [],
  });
  const visibleMaterialLots = useMemo(
    () => (showUsedUp ? materialLots : materialLots.filter((materialLot) => materialLot.remaining > 0)),
    [materialLots, showUsedUp],
  );

  const columns = useMemo(
    () => [
      columnHelper.accessor("heat", { header: HEAT_LABEL }),
      columnHelper.accessor((materialLot) => MATERIAL_LOT_UNIT_LABELS[materialLot.unit], {
        header: MATERIAL_LOT_UNIT_LABEL,
        id: "unit",
      }),
      columnHelper.accessor((materialLot) => formatDate(materialLot.receivedAt), {
        header: MATERIAL_LOT_RECEIVED_AT_LABEL,
        id: "receivedAt",
      }),
      columnHelper.accessor("receivedQuantity", { header: MATERIAL_LOT_RECEIVED_QUANTITY_LABEL }),
      columnHelper.accessor("remaining", { header: MATERIAL_LOT_REMAINING_LABEL }),
      columnHelper.display({
        cell: ({ row }) => <MaterialCertificateLink materialLot={row.original} />,
        header: MATERIAL_LOT_CERTIFICATE_LABEL,
        id: "certificate",
      }),
      columnHelper.display({
        cell: ({ row }) => (
          <ModelActions
            disabled={isLoading}
            extraComponentsStart={
              <>
                <Button
                  testId="button-material-lot-movements"
                  size="icon"
                  variant="secondary"
                  onClick={() => setMovementsMaterialLotId(row.original.id)}
                >
                  <HistoryIcon />
                </Button>
                <DialogMaterialLotMovement
                  mode={MaterialLotMovementMode.Take}
                  materialLot={row.original}
                  disabled={row.original.remaining <= 0}
                  productionOrderId={null}
                  iconOnly
                />
                <DialogMaterialLotMovement
                  mode={MaterialLotMovementMode.Return}
                  materialLot={row.original}
                  productionOrderId={null}
                  iconOnly
                />
              </>
            }
            onEdit={() => setFormMaterialLot(row.original)}
            deleteButton={
              (row.original.moved?.count ?? 0) > 0
                ? undefined
                : {
                    dialogTitle: MATERIAL_LOT_DELETE_TITLE,
                    dialogDescription: MATERIAL_LOT_DELETE_MESSAGE,
                    serializedModel: serializeMaterialLot(row.original),
                    onConfirm: () =>
                      void showToastOnTransaction({
                        transaction: () =>
                          dbClient.collection(materialLotCollection).delete(row.original.id, {
                            optimistic: import.meta.env.VITE_ENV_NAME !== "test",
                          }),
                        onSuccess: { title: MATERIAL_LOT_DELETED_MESSAGE },
                      }),
                  }
            }
          />
        ),
        header: ACTIONS_LABEL,
        id: "actions",
      }),
    ],
    [isLoading, dbClient, showToastOnTransaction],
  );

  return (
    <Dialog open={material !== undefined} onOpenChange={(open) => !open && onClose()}>
      <DialogContent data-testid="dialog-material-lots">
        <DialogHeader>
          <DialogTitle className="inline-flex items-center gap-1">
            {MATERIAL_LOTS_TITLE} <ShapeIcon shapeName={material?.shapeName} /> {material?.name}
          </DialogTitle>
        </DialogHeader>
        {material !== undefined && (
          <>
            <BaseTable
              testId="table-material-lots"
              columns={columns}
              rows={visibleMaterialLots}
              isLoading={isLoading}
              noDataMessage={NO_MATERIAL_LOTS_MESSAGE}
              headerExtraComponents={
                <>
                  <FieldLayoutContainer className="flex-row items-center gap-2">
                    <Checkbox
                      id={showUsedUpCheckboxId}
                      testId="checkbox-show-used-up-material-lots"
                      checked={showUsedUp}
                      onCheckedChange={setShowUsedUp}
                    />
                    <FieldLabel labelFor={showUsedUpCheckboxId}>{SHOW_USED_UP_MATERIAL_LOTS_LABEL}</FieldLabel>
                  </FieldLayoutContainer>
                  <Button
                    testId="button-create-material-lot"
                    variant="success"
                    onClick={() => setFormMaterialLot(null)}
                  >
                    <PlusIcon /> {MATERIAL_LOT_CREATE_TITLE}
                  </Button>
                </>
              }
            />
            <DialogMaterialLotForm
              materialId={material.id}
              materialLot={formMaterialLot ?? undefined}
              open={formMaterialLot !== undefined}
              onClose={() => setFormMaterialLot(undefined)}
            />
            <DialogMaterialLotMovements
              materialLot={materialLots.find((materialLot) => materialLot.id === movementsMaterialLotId)}
              onClose={() => setMovementsMaterialLotId(undefined)}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
