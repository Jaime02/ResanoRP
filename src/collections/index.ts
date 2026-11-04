import type { TElectricCollection } from "./base";
import blueprintCollection from "./blueprint";
import clientCollection from "./client";
import clientInvoiceEmailCollection from "./client-invoice-email";
import coatingCollection from "./coating";
import configurationCollection from "./configuration";
import deliveryMethodCollection from "./delivery-method";
import deliveryNoteCollection from "./delivery-note";
import deliveryNoteLineCollection from "./delivery-note-line";
import invoiceCollection from "./invoice";
import machineCollection from "./machine";
import machineProductionOrderQueueCollection from "./machine-production-order-queue";
import materialCollection from "./material";
import partCollection from "./part";
import partFeatureCollection from "./part-feature";
import partMaterialCollection from "./part-material";
import partPriceCollection from "./part-price";
import partPriceEstimatorCollection from "./part-price-estimator";
import partProductionCollection from "./part-production";
import partReferenceCollection from "./part-reference";
import partStockCollection from "./part-stock";
import paymentMethodCollection from "./payment-method";
import productionOrderCollection from "./production-order";
import qualityCheckCollection from "./quality-check";
import rawMaterialCollection from "./raw-material";
import sellOrderCollection from "./sell-order";
import sellOrderLineCollection from "./sell-order-line";
import shapeCollection from "./shape";
import treatmentReceptionCollection from "./treatment-reception";
import treatmentShipmentCollection from "./treatment-shipment";

export const allCollections: Array<TElectricCollection> = [
  blueprintCollection,
  clientCollection,
  clientInvoiceEmailCollection,
  coatingCollection,
  configurationCollection,
  deliveryMethodCollection,
  deliveryNoteCollection,
  deliveryNoteLineCollection,
  invoiceCollection,
  machineCollection,
  machineProductionOrderQueueCollection,
  materialCollection,
  partCollection,
  partFeatureCollection,
  partMaterialCollection,
  partPriceCollection,
  partPriceEstimatorCollection,
  partProductionCollection,
  partReferenceCollection,
  partStockCollection,
  paymentMethodCollection,
  productionOrderCollection,
  qualityCheckCollection,
  rawMaterialCollection,
  sellOrderCollection,
  sellOrderLineCollection,
  shapeCollection,
  treatmentReceptionCollection,
  treatmentShipmentCollection,
];
