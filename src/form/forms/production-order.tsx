import { useDbClient } from "@tanstack/react-db";
import { useSelector } from "@tanstack/react-store";

import productionOrderCollection from "@/collections/production-order";
import LayoutBlueprintViewer from "@/components/pdf/layout-blueprint-viewer";
import ButtonDeleteModel from "@/components/table/button-delete-model";
import TablePartProductionHistory from "@/components/table/part-production-history";
import TableQualityControl from "@/components/table/quality-control";
import ButtonLink from "@/components/ui/button-link";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import DateInput from "@/components/ui/date-input";
import Header from "@/components/ui/header";
import { ResizablePanel, ResizablePanelGroup, ResizablePanelSeparator } from "@/components/ui/resizable";
import { Separator } from "@/components/ui/separator";
import { useAppContext } from "@/contexts/app-context";
import { FormContextProvider } from "@/form";
import FieldLabel from "@/form/components/field-label";
import FieldLayoutContainer from "@/form/components/field-layout-container";
import PartFields from "@/form/components/part-fields";
import ProductionOrderFields from "@/form/components/production-order-fields";
import type { UseProductionOrderFormProps } from "@/form/hooks/use-production-order";
import useProductionOrderForm from "@/form/hooks/use-production-order";
import { hasDefaultQualityControl } from "@/lib/production-order";
import { serializeProductionOrder } from "@/lib/serializers";
import { BLUEPRINTS_TITLE } from "@/messages/blueprint";
import {
  DELETE_LABEL,
  DELIVERY_DATE_LABEL,
  NOT_SPECIFIED_MESSAGE,
  NOTES_LABEL,
  PART_LABEL,
  REFERENCE_LABEL,
} from "@/messages/common";
import {
  PRODUCTION_HISTORY_TITLE,
  PRODUCTION_ORDER_DELETE_MESSAGE,
  PRODUCTION_ORDER_DELETE_TITLE,
  PRODUCTION_ORDER_DELETED_MESSAGE,
  QUALITY_CONTROL_LABEL,
  QUANTITY_TO_PRODUCE_LABEL,
} from "@/messages/production-order";
import { SELL_ORDER_LABEL, VIEW_SELL_ORDER_LABEL } from "@/messages/sell-order";
import { useQueryPartBlueprints } from "@/queries/part";
import { useQueryActiveProductionOrder } from "@/queries/production-order";
import { FormMode, TablePartPickerMode } from "@/types";

interface FormProductionOrderProps extends Pick<
  UseProductionOrderFormProps,
  "requestedFormMode" | "onSubmit" | "createSellOrderLineId"
> {
  productionOrderId?: number;
}

export default function FormProductionOrder({
  requestedFormMode,
  productionOrderId,
  createSellOrderLineId,
  onSubmit,
}: FormProductionOrderProps) {
  const dbClient = useDbClient();
  const { isAdmin, showToastOnTransaction } = useAppContext();
  const { form, formMode, isLoading, productionOrder, sellOrderLine, validationSchema } = useProductionOrderForm({
    createSellOrderLineId,
    editProductionOrderId: productionOrderId,
    onSubmit,
    requestedFormMode,
  });
  const { data: productionOrderDetail } = useQueryActiveProductionOrder({ productionOrderId });
  const partReferenceToProduce =
    sellOrderLine != null && "partReference" in sellOrderLine ? sellOrderLine.partReference : undefined;
  const pickedPartId = useSelector(form.store, (state) => state.values.partId);
  const { data: pickedPartBlueprints } = useQueryPartBlueprints(pickedPartId);
  const notesField = (
    <form.AppField
      name="notes"
      children={(field) => <field.TextareaInput id="form-production-order-notes" label={NOTES_LABEL} />}
    />
  );
  const qualityControlField = (formMode === FormMode.Create || (formMode === FormMode.Update && isAdmin)) && (
    <form.AppField
      name="qualityControl"
      children={(field) => <field.Checkbox id="form-production-order-quality-control" label={QUALITY_CONTROL_LABEL} />}
    />
  );

  return (
    <FormContextProvider form={form} formMode={formMode} validationSchema={validationSchema} className="w-full grow">
      <ResizablePanelGroup orientation="horizontal" className="h-auto grow">
        <ResizablePanel className="flex min-w-0 flex-col items-center gap-2">
          <div className="flex flex-col items-center gap-2">
            {formMode !== FormMode.Create && (
              <div className="flex flex-row flex-wrap items-start justify-center gap-2">
                <Card>
                  <CardHeader>
                    <CardTitle>{PART_LABEL}</CardTitle>
                  </CardHeader>
                  <PartFields part={productionOrderDetail?.part} />
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Orden de producción {productionOrder?.id}</CardTitle>
                  </CardHeader>
                  <ProductionOrderFields
                    productionOrder={productionOrderDetail}
                    producedQuantity={productionOrder?.producedQuantity?.producedQuantity}
                  />
                  {notesField}
                  {qualityControlField}
                </Card>
              </div>
            )}
            {/* Created by hand there is no Pedido to show yet */}
            {formMode === FormMode.Create && sellOrderLine != null && (
              <div className="flex flex-row flex-wrap justify-center gap-2">
                {partReferenceToProduce != null && (
                  <FieldLayoutContainer>
                    <FieldLabel>{REFERENCE_LABEL}</FieldLabel>
                    <ButtonLink to="/part/$id" params={{ id: partReferenceToProduce.partId }} target="_blank">
                      {partReferenceToProduce.reference}
                    </ButtonLink>
                  </FieldLayoutContainer>
                )}
                <FieldLayoutContainer>
                  <FieldLabel>{SELL_ORDER_LABEL}</FieldLabel>
                  <ButtonLink to="/sell-order/$id" params={{ id: sellOrderLine.sellOrder?.id }} target="_blank">
                    {sellOrderLine.sellOrder?.clientReference ??
                      (sellOrderLine.sellOrder?.id !== undefined
                        ? String(sellOrderLine.sellOrder.id)
                        : VIEW_SELL_ORDER_LABEL)}
                  </ButtonLink>
                </FieldLayoutContainer>
                <FieldLayoutContainer>
                  <FieldLabel>{DELIVERY_DATE_LABEL}</FieldLabel>
                  <DateInput date={sellOrderLine.requestedDeliveryDate} disabled emptyMessage={NOT_SPECIFIED_MESSAGE} />
                </FieldLayoutContainer>
              </div>
            )}
            {formMode === FormMode.Create && (
              <>
                {partReferenceToProduce == null && (
                  <form.AppField
                    name="partId"
                    children={(field) => (
                      <field.PickerPart
                        id="form-production-order-part"
                        label={PART_LABEL}
                        pickerMode={TablePartPickerMode.PickParts}
                        onRowSelect={(row) => field.handleChange(row?.partId ?? null)}
                      />
                    )}
                  />
                )}
                <form.AppField
                  name="quantity"
                  listeners={{
                    onChange: ({ value }) => form.setFieldValue("qualityControl", hasDefaultQualityControl(value)),
                  }}
                  children={(field) => (
                    <field.NumberInput id="form-production-order-quantity" label={QUANTITY_TO_PRODUCE_LABEL} />
                  )}
                />
                {notesField}
                {qualityControlField}
              </>
            )}
            {formMode !== FormMode.ReadOnly && (
              <div className="flex w-full flex-row justify-end gap-2">
                {formMode !== FormMode.Create && (
                  <ButtonDeleteModel
                    dialogTitle={PRODUCTION_ORDER_DELETE_TITLE}
                    dialogDescription={PRODUCTION_ORDER_DELETE_MESSAGE}
                    serializedModel={productionOrder && serializeProductionOrder(productionOrder)}
                    onConfirm={async () => {
                      if (productionOrder?.id === undefined) return;
                      void showToastOnTransaction({
                        transaction: () =>
                          dbClient.collection(productionOrderCollection).delete(productionOrder.id, {
                            optimistic: import.meta.env.VITE_ENV_NAME !== "test",
                          }),
                        onSuccess: { title: PRODUCTION_ORDER_DELETED_MESSAGE },
                      });
                    }}
                    triggerExtraComponents={DELETE_LABEL}
                    size="default"
                  />
                )}
                <form.ButtonSubmit disableIfPristine={formMode !== FormMode.Create} />
              </div>
            )}
          </div>
          {productionOrderDetail?.qualityControl === true && (
            <TableQualityControl key={productionOrderDetail.id} productionOrder={productionOrderDetail} readOnly />
          )}
          <Separator orientation="horizontal" />
          <TablePartProductionHistory
            title={PRODUCTION_HISTORY_TITLE}
            partId={productionOrder?.part?.id ?? pickedPartId ?? undefined}
            skipQueries={isLoading}
          />
        </ResizablePanel>
        <ResizablePanelSeparator />
        <ResizablePanel className="flex min-h-0 min-w-0 flex-col gap-3">
          <Header>{BLUEPRINTS_TITLE}</Header>
          <LayoutBlueprintViewer
            blueprints={productionOrder?.part?.blueprints ?? pickedPartBlueprints}
            stackedFiles
            layoutClassName="grow basis-0"
            pdfViewerClassName="grow w-full"
          />
        </ResizablePanel>
      </ResizablePanelGroup>
    </FormContextProvider>
  );
}
