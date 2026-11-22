import { router } from "@/trpc";
import blueprintRouter from "@/trpc/blueprint";
import clientsRouter from "@/trpc/client";
import clientInvoiceEmailsRouter from "@/trpc/client-invoice-email";
import coatingRouter from "@/trpc/coating";
import configurationRouter from "@/trpc/configuration";
import deliveryMethodRouter from "@/trpc/delivery-method";
import deliveryNoteRouter from "@/trpc/delivery-note";
import deliveryNoteLineRouter from "@/trpc/delivery-note-line";
import invoiceRouter from "@/trpc/invoice";
import machineRouter from "@/trpc/machine";
import machineProductionOrderQueueRouter from "@/trpc/machine-production-order-queue";
import materialRouter from "@/trpc/material";
import partRouter from "@/trpc/part";
import partComponentRouter from "@/trpc/part-component";
import partFeatureRouter from "@/trpc/part-feature";
import partMaterialRouter from "@/trpc/part-material";
import partPriceRouter from "@/trpc/part-price";
import partPriceEstimatorRouter from "@/trpc/part-price-estimator";
import partReferenceRouter from "@/trpc/part-reference";
import partStockRouter from "@/trpc/part-stock";
import paymentMethodRouter from "@/trpc/payment-method";
import printerRouter from "@/trpc/printer";
import productionOrderRouter from "@/trpc/production-order";
import qualityCheckRouter from "@/trpc/quality-check";
import rawMaterialRouter from "@/trpc/raw-material";
import sellOrderRouter from "@/trpc/sell-order";
import sellOrderLineRouter from "@/trpc/sell-order-line";
import treatmentRouter from "@/trpc/treatment";

export const appRouter = router({
  client: clientsRouter,
  clientInvoiceEmail: clientInvoiceEmailsRouter,
  blueprint: blueprintRouter,
  coating: coatingRouter,
  configuration: configurationRouter,
  deliveryMethod: deliveryMethodRouter,
  deliveryNote: deliveryNoteRouter,
  deliveryNoteLine: deliveryNoteLineRouter,
  invoice: invoiceRouter,
  machine: machineRouter,
  machineProductionOrderQueue: machineProductionOrderQueueRouter,
  material: materialRouter,
  part: partRouter,
  partComponent: partComponentRouter,
  partFeature: partFeatureRouter,
  partPrice: partPriceRouter,
  partPriceEstimator: partPriceEstimatorRouter,
  partReference: partReferenceRouter,
  partStock: partStockRouter,
  paymentMethod: paymentMethodRouter,
  printer: printerRouter,
  qualityCheck: qualityCheckRouter,
  rawMaterial: rawMaterialRouter,
  sellOrder: sellOrderRouter,
  sellOrderLine: sellOrderLineRouter,
  partMaterial: partMaterialRouter,
  productionOrder: productionOrderRouter,
  treatment: treatmentRouter,
});
