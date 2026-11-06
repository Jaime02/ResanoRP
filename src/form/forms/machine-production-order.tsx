import { useNavigate } from "@tanstack/react-router";
import { LoaderIcon, PrinterIcon } from "lucide-react";
import { useCallback, useState } from "react";

import DialogMachineProductionOrderQueue from "@/components/dialog/machine-queue";
import StopIcon from "@/components/images/StopIcon";
import LayoutBlueprintViewer from "@/components/pdf/layout-blueprint-viewer";
import TableQualityControl from "@/components/table/quality-control";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import ButtonLink from "@/components/ui/button-link";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import Header from "@/components/ui/header";
import { ResizablePanel, ResizablePanelGroup, ResizablePanelSeparator } from "@/components/ui/resizable";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useAppContext } from "@/contexts/app-context";
import { FormContextProvider } from "@/form";
import FieldLabel from "@/form/components/field-label";
import FieldLayoutContainer from "@/form/components/field-layout-container";
import PartFields from "@/form/components/part-fields";
import ProductionOrderFields from "@/form/components/production-order-fields";
import type useMachineProductionOrderForm from "@/form/hooks/use-machine-production-order";
import { BLUEPRINTS_TITLE } from "@/messages/blueprint";
import { NOTES_LABEL, PART_LABEL } from "@/messages/common";
import {
  LABEL_NOT_PRINTED_TITLE,
  LABEL_PRINTED_MESSAGE,
  STOP_PRODUCTION_ORDER_TITLE,
  UNITS_PRODUCED_LABEL,
  NO_LABEL_PRINTED_MESSAGE,
  PRINT_LABEL_LABEL,
  STOP_PRODUCTION_LABEL,
} from "@/messages/production-order";
import type { TMachineProductionOrderQueueItem } from "@/queries/machine";
import { useQueryProductionOrderProducedQuantity, type TActiveProductionOrder } from "@/queries/production-order";
import trpc from "@/trpc/trpc-client";
import { FormMode } from "@/types";

interface FormMachineProductionOrderProps extends Pick<
  ReturnType<typeof useMachineProductionOrderForm>,
  | "formUpdateMachineProductionOrder"
  | "formUpdateMachineProductionOrderValidationSchema"
  | "formStopCurrentProductionOrder"
  | "formStopCurrentProductionOrderValidationSchema"
  | "isLoading"
> {
  activeProductionOrder?: TActiveProductionOrder;
  productionOrdersQueue?: Array<TMachineProductionOrderQueueItem>;
  dialogStopProductionOrderOpen?: boolean;
  dialogMachineProductionOrderQueueOpen?: boolean;
}

export default function FormMachineProductionOrder({
  formUpdateMachineProductionOrder,
  formUpdateMachineProductionOrderValidationSchema,
  formStopCurrentProductionOrder,
  formStopCurrentProductionOrderValidationSchema,
  isLoading,
  activeProductionOrder,
  productionOrdersQueue,
  dialogStopProductionOrderOpen,
  dialogMachineProductionOrderQueueOpen,
}: FormMachineProductionOrderProps) {
  const { userModeMachine, showToastOnTRPCMutation } = useAppContext();
  const navigate = useNavigate();
  const { data: producedQuantity } = useQueryProductionOrderProducedQuantity(activeProductionOrder?.id);
  const [isTagPrinted, setIsTagPrinted] = useState(false);
  const [isPrintingTag, setIsPrintingTag] = useState(false);
  const [isDialogNoTagPrintedOpen, setIsDialogNoTagPrintedOpen] = useState(false);

  const printTag = useCallback(
    async (partQuantity: number) => {
      if (!activeProductionOrder) return;
      setIsPrintingTag(true);
      await showToastOnTRPCMutation({
        mutation: trpc.productionOrder.printTag.mutate({ partQuantity, productionOrderId: activeProductionOrder.id }),
        onSuccess: { title: LABEL_PRINTED_MESSAGE },
        onSubmit: async () => setIsTagPrinted(true),
      });
      setIsPrintingTag(false);
    },
    [activeProductionOrder, showToastOnTRPCMutation],
  );

  return (
    <ResizablePanelGroup orientation="horizontal" className="h-auto grow">
      <ResizablePanel className="flex min-w-0 flex-col items-center gap-2 overflow-auto">
        <div className="flex flex-col gap-2">
          <div className="flex flex-row flex-wrap items-start justify-center gap-2">
            <Card>
              <CardHeader>
                <CardTitle>
                  <ButtonLink
                    testId="button-link-part"
                    to="/part/$id"
                    params={{ id: activeProductionOrder?.part?.id }}
                    target="_blank"
                    disabled={activeProductionOrder?.part === undefined}
                  >
                    {PART_LABEL}
                  </ButtonLink>
                </CardTitle>
              </CardHeader>
              <PartFields part={activeProductionOrder?.part} />
            </Card>
            <Card data-testid="form-machine-production-order">
              <CardHeader>
                <CardTitle>Orden de producción {activeProductionOrder?.id}</CardTitle>
              </CardHeader>
              <FormContextProvider
                form={formUpdateMachineProductionOrder}
                formMode={FormMode.Update}
                validationSchema={formUpdateMachineProductionOrderValidationSchema}
              >
                <ProductionOrderFields
                  productionOrder={activeProductionOrder}
                  producedQuantity={producedQuantity?.producedQuantity}
                />
                <formUpdateMachineProductionOrder.AppField
                  name="notes"
                  children={(field) => (
                    <field.TextareaInput
                      id="input-notes-machine-production-order"
                      label={NOTES_LABEL}
                      onBlur={() => void formUpdateMachineProductionOrder.handleSubmit()}
                    />
                  )}
                />
              </FormContextProvider>
            </Card>
          </div>
          <div className="flex flex-row justify-end gap-2">
            <DialogMachineProductionOrderQueue
              activeProductionOrderId={activeProductionOrder?.id}
              productionOrdersQueue={productionOrdersQueue}
              isLoading={isLoading}
              open={dialogMachineProductionOrderQueueOpen === true && Boolean(userModeMachine)}
              onOpenChange={async (open) => {
                if (!activeProductionOrder) {
                  return;
                }
                await navigate({
                  search: { dialogMachineProductionOrderQueueOpen: open ? true : undefined },
                  to: ".",
                });
              }}
            />
            <FormContextProvider
              form={formStopCurrentProductionOrder}
              formMode={FormMode.Update}
              validationSchema={formStopCurrentProductionOrderValidationSchema}
              className="mx-0"
            >
              <AlertDialog
                open={
                  dialogStopProductionOrderOpen === true && Boolean(activeProductionOrder) && Boolean(userModeMachine)
                }
                onOpenChange={(open) => {
                  setIsTagPrinted(false);
                  void navigate({ search: { dialogStopProductionOrderOpen: open ? true : undefined }, to: "." });
                }}
              >
                <AlertDialogTrigger
                  testId="button-dialog-trigger-stop-production-order"
                  disabled={isLoading || !activeProductionOrder}
                >
                  <StopIcon />
                  {STOP_PRODUCTION_LABEL}
                </AlertDialogTrigger>
                <AlertDialogContent data-testid="dialog-content-stop-production-order">
                  <AlertDialogTitle>{STOP_PRODUCTION_ORDER_TITLE}</AlertDialogTitle>
                  <formStopCurrentProductionOrder.AppField
                    name="producedQuantity"
                    children={(field) => (
                      <field.NumberInput
                        id="input-produced-quantity-stop-production-order"
                        label={UNITS_PRODUCED_LABEL}
                        autoComplete="off"
                        layoutClassName="self-center"
                      />
                    )}
                  />
                  <formStopCurrentProductionOrder.Subscribe
                    selector={(state) => state.values.producedQuantity}
                    children={(producedQuantity) => (
                      <AlertDialogFooter>
                        <Button
                          testId="button-print-tag-stop-production-order"
                          variant="secondary"
                          disabled={isLoading || isPrintingTag || producedQuantity === null || producedQuantity <= 0}
                          onClick={() => {
                            if (producedQuantity === null) return;
                            void printTag(producedQuantity);
                          }}
                        >
                          {isPrintingTag ? <LoaderIcon className="animate-spin" /> : <PrinterIcon />}
                          {PRINT_LABEL_LABEL}
                        </Button>
                        <formStopCurrentProductionOrder.ButtonSubmit
                          testId="button-confirm-stop-production-order"
                          variant="success"
                          disableIfPristine={false}
                          onClick={() => {
                            if (!isTagPrinted && producedQuantity !== null && producedQuantity > 0) {
                              setIsDialogNoTagPrintedOpen(true);
                              return;
                            }
                            void formStopCurrentProductionOrder.handleSubmit();
                          }}
                        >
                          <StopIcon />
                          {STOP_PRODUCTION_LABEL}
                        </formStopCurrentProductionOrder.ButtonSubmit>
                      </AlertDialogFooter>
                    )}
                  />
                  <AlertDialog open={isDialogNoTagPrintedOpen} onOpenChange={setIsDialogNoTagPrintedOpen}>
                    <AlertDialogContent data-testid="dialog-content-no-tag-printed-stop-production-order">
                      <AlertDialogTitle>{LABEL_NOT_PRINTED_TITLE}</AlertDialogTitle>
                      <AlertDialogDescription>{NO_LABEL_PRINTED_MESSAGE}</AlertDialogDescription>
                      <AlertDialogFooter>
                        <AlertDialogAction
                          testId="button-confirm-no-tag-printed-stop-production-order"
                          variant="success"
                          onClick={() => void formStopCurrentProductionOrder.handleSubmit()}
                        >
                          <StopIcon />
                          {STOP_PRODUCTION_LABEL}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </AlertDialogContent>
              </AlertDialog>
            </FormContextProvider>
          </div>
        </div>
        {activeProductionOrder?.qualityControl === true && (
          <>
            <Separator orientation="horizontal" />
            <TableQualityControl key={activeProductionOrder.id} productionOrder={activeProductionOrder} />
          </>
        )}
      </ResizablePanel>
      <ResizablePanelSeparator />
      <ResizablePanel className="flex min-h-0 min-w-0 flex-col gap-3">
        <Header>{BLUEPRINTS_TITLE}</Header>
        <LayoutBlueprintViewer
          blueprints={activeProductionOrder?.part?.blueprints}
          stackedFiles
          layoutClassName="grow basis-0"
          pdfViewerClassName="grow w-full"
          fullScreenContent={
            <Collapsible defaultOpen>
              <Card
                data-testid="card-full-screen-production-order-info"
                className="fixed top-4 left-6 z-20 max-h-[calc(100vh-2rem)] overflow-auto shadow-lg"
              >
                <CardHeader>
                  <CardTitle level={3}>
                    <CollapsibleTrigger /> Artículo
                  </CardTitle>
                </CardHeader>
                <CollapsibleContent className="flex flex-col gap-2">
                  <PartFields part={activeProductionOrder?.part} />
                  <Separator />
                  <Card variant="frameless">
                    <CardTitle level={3}>Orden de producción {activeProductionOrder?.id}</CardTitle>
                    <ProductionOrderFields
                      productionOrder={activeProductionOrder}
                      producedQuantity={producedQuantity?.producedQuantity}
                    />
                    <FieldLayoutContainer>
                      <FieldLabel>{NOTES_LABEL}</FieldLabel>
                      <Textarea value={activeProductionOrder?.notes ?? ""} readOnly />
                    </FieldLayoutContainer>
                  </Card>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          }
        />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
