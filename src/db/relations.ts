import { defineRelations } from "drizzle-orm";

import {
  dbTableCoating,
  dbTableShape,
  dbTableRawMaterial,
  dbTableMaterial,
  dbTableMachineProductionOrderQueue,
  dbTableMachine,
  dbTableProductionOrder,
  dbTablePaymentMethod,
  dbTableDeliveryMethod,
  dbTableClient,
  dbTablePart,
  dbTableClientInvoiceEmail,
  dbTableSellOrder,
  dbTableSellOrderLine,
  dbTableInvoice,
  dbTableDeliveryNote,
  dbTableDeliveryNoteLine,
  dbTablePartFeature,
  dbTablePartReference,
  dbTablePartPrice,
  dbTablePartMaterial,
  dbTablePartPriceEstimator,
  dbTableBlueprint,
  dbTablePartProduction,
  dbTablePartStock,
  dbTableConfiguration,
  dbTableTreatmentReception,
  dbTableTreatmentShipment,
  dbTableQualityCheck,
} from "@/db/schema";

export default defineRelations(
  {
    dbTableCoating,
    dbTableShape,
    dbTableRawMaterial,
    dbTableMaterial,
    dbTableMachineProductionOrderQueue,
    dbTableMachine,
    dbTableProductionOrder,
    dbTablePaymentMethod,
    dbTableDeliveryMethod,
    dbTableClient,
    dbTablePart,
    dbTableClientInvoiceEmail,
    dbTableSellOrder,
    dbTableSellOrderLine,
    dbTableInvoice,
    dbTableDeliveryNote,
    dbTableDeliveryNoteLine,
    dbTablePartFeature,
    dbTablePartReference,
    dbTablePartPrice,
    dbTablePartMaterial,
    dbTablePartPriceEstimator,
    dbTableBlueprint,
    dbTablePartProduction,
    dbTablePartStock,
    dbTableConfiguration,
    dbTableTreatmentReception,
    dbTableTreatmentShipment,
    dbTableQualityCheck,
  },
  (r) => ({
    dbTableCoating: {
      parts: r.many.dbTablePart(),
    },
    dbTableShape: {
      materials: r.many.dbTableMaterial(),
      parts: r.many.dbTablePart(),
    },
    dbTableRawMaterial: {
      materials: r.many.dbTableMaterial(),
    },
    dbTableMaterial: {
      partMaterials: r.many.dbTablePartMaterial(),
      rawMaterial: r.one.dbTableRawMaterial({
        from: r.dbTableMaterial.rawMaterialId,
        to: r.dbTableRawMaterial.id,
        optional: false,
      }),
      shape: r.one.dbTableShape({
        from: r.dbTableMaterial.shapeId,
        to: r.dbTableShape.id,
        optional: false,
      }),
    },
    dbTableMachineProductionOrderQueue: {
      machine: r.one.dbTableMachine({
        from: r.dbTableMachineProductionOrderQueue.machineId,
        to: r.dbTableMachine.id,
        optional: false,
      }),
      productionOrder: r.one.dbTableProductionOrder({
        from: r.dbTableMachineProductionOrderQueue.productionOrderId,
        to: r.dbTableProductionOrder.id,
        optional: false,
      }),
    },
    dbTableMachine: {
      activeProductionOrder: r.one.dbTableProductionOrder({
        from: r.dbTableMachine.activeProductionOrderId,
        to: r.dbTableProductionOrder.id,
      }),
      machineProductionOrderQueues: r.many.dbTableMachineProductionOrderQueue(),
      partProductions: r.many.dbTablePartProduction(),
    },
    dbTablePartProduction: {
      machine: r.one.dbTableMachine({
        from: r.dbTablePartProduction.machineId,
        to: r.dbTableMachine.id,
        optional: false,
      }),
      productionOrder: r.one.dbTableProductionOrder({
        from: r.dbTablePartProduction.productionOrderId,
        to: r.dbTableProductionOrder.id,
        optional: false,
      }),
    },
    dbTablePaymentMethod: {
      clients: r.many.dbTableClient(),
      invoices: r.many.dbTableInvoice(),
      sellOrders: r.many.dbTableSellOrder(),
    },
    dbTableDeliveryMethod: {
      deliveryNotes: r.many.dbTableDeliveryNote(),
    },
    dbTableClient: {
      defaultDeliveryMethod: r.one.dbTableDeliveryMethod({
        from: r.dbTableClient.defaultDeliveryMethodId,
        to: r.dbTableDeliveryMethod.id,
      }),
      defaultPaymentMethod: r.one.dbTablePaymentMethod({
        from: r.dbTableClient.defaultPaymentMethodId,
        to: r.dbTablePaymentMethod.id,
      }),
      deliveryNotes: r.many.dbTableDeliveryNote(),
      invoiceEmails: r.many.dbTableClientInvoiceEmail(),
      invoices: r.many.dbTableInvoice(),
      partPrices: r.many.dbTablePartPrice(),
      partReferences: r.many.dbTablePartReference(),
      sellOrders: r.many.dbTableSellOrder(),
    },
    dbTablePart: {
      coating: r.one.dbTableCoating({
        from: r.dbTablePart.coatingId,
        to: r.dbTableCoating.id,
      }),
      features: r.many.dbTablePartFeature(),
      materials: r.many.dbTablePartMaterial(),
      priceEstimator: r.one.dbTablePartPriceEstimator({
        from: r.dbTablePart.id,
        to: r.dbTablePartPriceEstimator.partId,
      }),
      prices: r.many.dbTablePartPrice(),
      productionOrders: r.many.dbTableProductionOrder(),
      partStocks: r.many.dbTablePartStock(),
      references: r.many.dbTablePartReference(),
      shape: r.one.dbTableShape({
        from: r.dbTablePart.shapeId,
        to: r.dbTableShape.id,
      }),
      treatmentShipments: r.many.dbTableTreatmentShipment(),
    },
    dbTablePartStock: {
      part: r.one.dbTablePart({
        from: r.dbTablePartStock.partId,
        to: r.dbTablePart.id,
        optional: false,
      }),
    },
    dbTableClientInvoiceEmail: {
      client: r.one.dbTableClient({
        from: r.dbTableClientInvoiceEmail.clientId,
        to: r.dbTableClient.id,
        optional: false,
      }),
    },
    dbTableSellOrder: {
      client: r.one.dbTableClient({
        from: r.dbTableSellOrder.clientId,
        to: r.dbTableClient.id,
        optional: false,
      }),
      paymentMethod: r.one.dbTablePaymentMethod({
        from: r.dbTableSellOrder.paymentMethodId,
        to: r.dbTablePaymentMethod.id,
      }),
      sellOrderLines: r.many.dbTableSellOrderLine(),
    },
    dbTableSellOrderLine: {
      deliveryNoteLines: r.many.dbTableDeliveryNoteLine(),
      partReference: r.one.dbTablePartReference({
        from: r.dbTableSellOrderLine.partReferenceId,
        to: r.dbTablePartReference.id,
      }),
      productionOrder: r.one.dbTableProductionOrder({
        from: r.dbTableSellOrderLine.id,
        to: r.dbTableProductionOrder.sellOrderLineId,
      }),
      sellOrder: r.one.dbTableSellOrder({
        from: r.dbTableSellOrderLine.sellOrderId,
        to: r.dbTableSellOrder.id,
      }),
    },
    dbTableInvoice: {
      client: r.one.dbTableClient({
        from: r.dbTableInvoice.clientId,
        to: r.dbTableClient.id,
        optional: false,
      }),
      deliveryNotes: r.many.dbTableDeliveryNote(),
      paymentMethod: r.one.dbTablePaymentMethod({
        from: r.dbTableInvoice.paymentMethodId,
        to: r.dbTablePaymentMethod.id,
      }),
    },
    dbTableDeliveryNote: {
      client: r.one.dbTableClient({
        from: r.dbTableDeliveryNote.clientId,
        to: r.dbTableClient.id,
        optional: false,
      }),
      deliveryMethod: r.one.dbTableDeliveryMethod({
        from: r.dbTableDeliveryNote.deliveryMethodId,
        to: r.dbTableDeliveryMethod.id,
      }),
      deliveryNoteLines: r.many.dbTableDeliveryNoteLine(),
      invoice: r.one.dbTableInvoice({
        from: r.dbTableDeliveryNote.invoiceId,
        to: r.dbTableInvoice.id,
      }),
    },
    dbTableDeliveryNoteLine: {
      deliveryNote: r.one.dbTableDeliveryNote({
        from: r.dbTableDeliveryNoteLine.deliveryNoteId,
        to: r.dbTableDeliveryNote.id,
        optional: false,
      }),
      partReference: r.one.dbTablePartReference({
        from: r.dbTableDeliveryNoteLine.partReferenceId,
        to: r.dbTablePartReference.id,
      }),
      sellOrderLine: r.one.dbTableSellOrderLine({
        from: r.dbTableDeliveryNoteLine.sellOrderLineId,
        to: r.dbTableSellOrderLine.id,
      }),
    },
    dbTableProductionOrder: {
      part: r.one.dbTablePart({
        from: r.dbTableProductionOrder.partId,
        to: r.dbTablePart.id,
        optional: false,
      }),
      sellOrderLine: r.one.dbTableSellOrderLine({
        from: r.dbTableProductionOrder.sellOrderLineId,
        to: r.dbTableSellOrderLine.id,
      }),
      machineProductionOrderQueues: r.many.dbTableMachineProductionOrderQueue(),
      partProductions: r.many.dbTablePartProduction(),
      treatmentShipments: r.many.dbTableTreatmentShipment(),
    },
    dbTableTreatmentShipment: {
      part: r.one.dbTablePart({
        from: r.dbTableTreatmentShipment.partId,
        to: r.dbTablePart.id,
        optional: false,
      }),
      productionOrder: r.one.dbTableProductionOrder({
        from: r.dbTableTreatmentShipment.productionOrderId,
        to: r.dbTableProductionOrder.id,
      }),
      treatmentReceptions: r.many.dbTableTreatmentReception(),
    },
    dbTableTreatmentReception: {
      treatmentShipment: r.one.dbTableTreatmentShipment({
        from: r.dbTableTreatmentReception.treatmentShipmentId,
        to: r.dbTableTreatmentShipment.id,
        optional: false,
      }),
    },
    dbTablePartFeature: {
      part: r.one.dbTablePart({
        from: r.dbTablePartFeature.partId,
        to: r.dbTablePart.id,
        optional: false,
      }),
    },
    dbTablePartReference: {
      client: r.one.dbTableClient({
        from: r.dbTablePartReference.clientId,
        to: r.dbTableClient.id,
      }),
      part: r.one.dbTablePart({
        from: r.dbTablePartReference.partId,
        to: r.dbTablePart.id,
        optional: false,
      }),
      deliveryNoteLines: r.many.dbTableDeliveryNoteLine(),
    },
    dbTablePartPrice: {
      client: r.one.dbTableClient({
        from: r.dbTablePartPrice.clientId,
        to: r.dbTableClient.id,
      }),
      part: r.one.dbTablePart({
        from: r.dbTablePartPrice.partId,
        to: r.dbTablePart.id,
        optional: false,
      }),
    },
    dbTablePartMaterial: {
      material: r.one.dbTableMaterial({
        from: r.dbTablePartMaterial.materialId,
        to: r.dbTableMaterial.id,
        optional: false,
      }),
      part: r.one.dbTablePart({
        from: r.dbTablePartMaterial.partId,
        to: r.dbTablePart.id,
        optional: false,
      }),
    },
    dbTablePartPriceEstimator: {
      part: r.one.dbTablePart({
        from: r.dbTablePartPriceEstimator.partId,
        to: r.dbTablePart.id,
      }),
    },
    dbTableBlueprint: {
      part: r.one.dbTablePart({
        from: r.dbTableBlueprint.partId,
        to: r.dbTablePart.id,
        optional: false,
      }),
    },
  }),
);
