import type { BaseBlueprint } from "@/types/blueprint";
import type { BaseClient } from "@/types/client";
import type { BaseClientInvoiceEmail } from "@/types/client-invoice-email";
import type { BaseCoating } from "@/types/coating";
import type { BaseConfiguration } from "@/types/configuration";
import type { BaseDeliveryMethod } from "@/types/delivery-method";
import type { BaseDeliveryNote } from "@/types/delivery-note";
import type { BaseDeliveryNoteLine } from "@/types/delivery-note-line";
import type { BaseInvoice } from "@/types/invoice";
import type { BaseMachine } from "@/types/machine";
import type { BaseMachineProductionOrderQueue } from "@/types/machine-production-order-queue";
import type { BaseMaterial } from "@/types/material";
import type { BasePart } from "@/types/part";
import type { BasePartFeature } from "@/types/part-feature";
import type { BasePartMaterial } from "@/types/part-material";
import type { BasePartPrice } from "@/types/part-price";
import type { BasePartPriceEstimator } from "@/types/part-price-estimator";
import type { BasePartProduction } from "@/types/part-production";
import type { BasePartReference } from "@/types/part-reference";
import type { BasePartStock } from "@/types/part-stock";
import type { BasePaymentMethod } from "@/types/payment-method";
import type { BaseProductionOrder } from "@/types/production-order";
import type { BaseQualityCheck } from "@/types/quality-check";
import type { BaseRawMaterial } from "@/types/raw-material";
import type { BaseSellOrder } from "@/types/sell-order";
import type { BaseSellOrderLine } from "@/types/sell-order-line";
import type { BaseShape } from "@/types/shape";
import type { BaseTreatmentReception, BaseTreatmentShipment } from "@/types/treatment";

export const MOCK_DATA_PATH = import.meta.dirname;
export const MOCK_INITIAL_DATE = new Date("2026-03-02T08:00:00");

const HOUR_IN_MS = 1000 * 3600;
export const DAY_IN_MS = HOUR_IN_MS * 24;

export const mockPaymentMethods: Array<BasePaymentMethod> = [
  { deletedAt: null, generatesReceipt: true, id: 1, name: "ID-1 Bank Transfer", paymentDeadlineDays: 45 },
  { deletedAt: null, generatesReceipt: false, id: 2, name: "ID-2 Credit Card", paymentDeadlineDays: null },
  { deletedAt: null, generatesReceipt: true, id: 3, name: "ID-3 Direct Debit", paymentDeadlineDays: 30 },
  { deletedAt: null, generatesReceipt: false, id: 4, name: "ID-4 PayPal", paymentDeadlineDays: null },
  { deletedAt: null, generatesReceipt: false, id: 5, name: "ID-5 Cash", paymentDeadlineDays: null },
];

export const mockClients: Array<BaseClient> = [
  {
    // Longer than the 35 characters the accounting export keeps
    address: "Address 1, Polígono Industrial Ejemplo, Nave 12",
    city: "City 1",
    country: "Spain",
    defaultDeliveryMethodId: null,
    defaultPaymentMethodId: null,
    deletedAt: null,
    iban: "ES1234567890123456789012",
    id: 1,
    legalName: "Client 1 Legal Name",
    name: "Client 1",
    phone: "123456789",
    postalCode: "12345",
    prismaAccountingAccountId: "4300001",
    province: "Province 1",
    taxId: "A12345678",
  },
  {
    address: "Address 2",
    city: "City 2",
    country: "Spain",
    defaultDeliveryMethodId: 1,
    defaultPaymentMethodId: 4,
    deletedAt: null,
    iban: "ES0987654321098765432109",
    id: 2,
    legalName: "Client 2 Legal Name",
    name: "Client 2",
    phone: "987654321",
    postalCode: "67890",
    prismaAccountingAccountId: "430000002",
    province: "Province 2",
    taxId: "B87654321",
  },
];

export const mockCoatings: Array<BaseCoating> = [
  { deletedAt: null, id: 1, name: "ID-1 Cincado Blanco" },
  { deletedAt: null, id: 2, name: "ID-2 Cincado Blanco + Sellado" },
  { deletedAt: null, id: 3, name: "ID-3 Cincado Amarillo + Sellado" },
  { deletedAt: null, id: 4, name: "ID-4 Cincado Negro" },
  { deletedAt: null, id: 5, name: "ID-5 Cincado Negro + Sellado" },
  { deletedAt: null, id: 6, name: "ID-6 Cincado Blanco + Sellado 720h" },
  { deletedAt: null, id: 7, name: "ID-7 Cincado Blanco + Sellado 1440h" },
  { deletedAt: null, id: 8, name: "ID-8 Estañado" },
  { deletedAt: null, id: 9, name: "ID-9 Templado" },
];

export const mockShapes: Array<BaseShape> = [
  { id: 1, name: "ID-1 Redondo" },
  { id: 2, name: "ID-2 Hexagonal" },
  { id: 3, name: "ID-3 Tubo" },
  { id: 4, name: "ID-4 Cuadrado" },
  { id: 5, name: "ID-5 Otro" },
];

export const mockRawMaterials: Array<BaseRawMaterial> = [
  { deletedAt: null, density: "7.85", id: 1, name: "ID-1 F-211", price: "0.8" },
  { deletedAt: null, density: "7.85", id: 2, name: "ID-2 F-1", price: "1" },
  { deletedAt: null, density: "7.85", id: 3, name: "ID-3 F-114", price: "2" },
  { deletedAt: null, density: "7.85", id: 4, name: "ID-4 F-212", price: "1.5" },
  { deletedAt: null, density: "8", id: 5, name: "ID-5 Inoxidable AISI 303", price: "3" },
  { deletedAt: null, density: "7.93", id: 6, name: "ID-6 Inoxidable AISI 304", price: "4" },
  { deletedAt: null, density: "8.5", id: 7, name: "ID-7 Latón", price: "2.5" },
  { deletedAt: null, density: null, id: 8, name: "ID-8 Plástico blanco", price: "1.8" },
  { deletedAt: null, density: "1.4", id: 9, name: "ID-9 Plástico negro", price: "1.7" },
];

export const mockDeliveryMethods: Array<BaseDeliveryMethod> = [
  { deletedAt: null, id: 1, name: "ID-1 Por nuestra cuenta" },
  { deletedAt: null, id: 2, name: "ID-2 Por cuenta del cliente" },
  { deletedAt: null, id: 3, name: "ID-3 DHL" },
  { deletedAt: null, id: 4, name: "ID-4 Correos" },
];

export const mockConfigurations: Array<BaseConfiguration> = [
  {
    address: "Polígono Industrial Ejemplo, C/A Nº 1",
    bankAccount: "ES00 0000 0000 0000 0000 0000",
    city: "Ciudad Ejemplo",
    email: "info@empresa-ejemplo.test",
    id: 1,
    invoiceFootnote: "Pie de factura de prueba",
    invoiceSenderEmail: "facturas@empresa-ejemplo.test",
    legalName: "Empresa Ejemplo S.L.",
    phone: "900 000 000",
    postalCode: "00000",
    province: "Provincia Ejemplo",
    taxId: "B00000000",
    vatPercentage: 21,
    website: "www.empresa-ejemplo.test",
  },
];

export const mockClientInvoiceEmails: Array<BaseClientInvoiceEmail> = [
  {
    clientId: 1,
    email: "ID-1 client1@example.com",
    id: 1,
  },
  {
    clientId: 2,
    email: "ID-2 client2@example.com",
    id: 2,
  },
];

export const mockMaterials: Array<BaseMaterial> = [
  { deletedAt: null, id: 1, rawMaterialId: 1, shapeId: 1, width: "10" },
  { deletedAt: null, id: 2, rawMaterialId: 1, shapeId: 1, width: "12" },
  { deletedAt: null, id: 3, rawMaterialId: 3, shapeId: 3, width: "30" },
  { deletedAt: null, id: 4, rawMaterialId: 4, shapeId: 4, width: "40" },
  { deletedAt: null, id: 5, rawMaterialId: 5, shapeId: 5, width: "50.5" },
];

export const mockParts: Array<BasePart> = [
  {
    coatingId: 1,
    deletedAt: null,
    description: "Id 1, coating 1, shape 1",
    id: 1,
    length: "12.0",
    notes: "Part 1 notes",
    shapeId: 1,
    width: "10",
  },
  {
    coatingId: 5,
    deletedAt: null,
    description: "Id 2, coating 5, shape 3",
    id: 2,
    length: "12.5",
    notes: "Part 2 notes",
    shapeId: 3,
    width: "29.0",
  },
  {
    coatingId: null,
    deletedAt: null,
    description: "Id 3, coating null, shape 5",
    id: 3,
    length: "80.0",
    notes: null,
    shapeId: 5,
    width: "40.0",
  },
  {
    coatingId: 1,
    deletedAt: null,
    description: "Id 4, coating 1, shape 5",
    id: 4,
    length: "4.0",
    notes: "Part 4 notes",
    shapeId: 5,
    width: "12.0",
  },
  {
    coatingId: 2,
    deletedAt: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 10),
    description: "(DELETED) Id 5, coating 2, shape 4",
    id: 5,
    length: "10.0",
    notes: "Part 5 notes",
    shapeId: 4,
    width: "70.0",
  },
  {
    coatingId: null,
    deletedAt: null,
    description: "Id 6, coating null, shape 5",
    id: 6,
    length: "5.0",
    notes: "Part 6 notes",
    shapeId: 5,
    width: "20.0",
  },
];

export const mockPartPrices: Array<BasePartPrice> = [
  {
    clientId: 1,
    createdAt: new Date(MOCK_INITIAL_DATE),
    id: 1,
    partId: 1,
    price: "10.5",
    quantity: 100,
  },
  {
    clientId: 2,
    createdAt: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 2),
    id: 2,
    partId: 1,
    price: "9.99",
    quantity: 30,
  },
  {
    clientId: 2,
    createdAt: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 4),
    id: 3,
    partId: 2,
    price: "25.75",
    quantity: 50,
  },
  {
    clientId: null,
    createdAt: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 31),
    id: 4,
    partId: 3,
    price: "8.00",
    quantity: 500,
  },
  {
    clientId: 2,
    createdAt: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 365),
    id: 5,
    partId: 4,
    price: "120.00",
    quantity: 10,
  },
  {
    clientId: 1,
    createdAt: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS),
    id: 6,
    partId: 2,
    price: null,
    quantity: 200,
  },
  {
    clientId: null,
    createdAt: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 3),
    id: 7,
    partId: 3,
    price: null,
    quantity: 1000,
  },
  {
    clientId: 2,
    createdAt: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 7),
    id: 8,
    partId: 5,
    price: null,
    quantity: 25,
  },
  {
    clientId: 2,
    createdAt: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 2),
    id: 9,
    partId: 2,
    price: null,
    quantity: 500,
  },
  {
    clientId: 1,
    createdAt: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS),
    id: 10,
    partId: 4,
    price: null,
    quantity: 10,
  },
  {
    clientId: 2,
    createdAt: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 10),
    id: 11,
    partId: 4,
    price: null,
    quantity: 50,
  },
  {
    clientId: null,
    createdAt: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 60),
    id: 12,
    partId: 4,
    price: null,
    quantity: 100,
  },
];

export const mockPartMaterials: Array<BasePartMaterial> = [
  {
    materialId: 1,
    partId: 1,
  },
  {
    materialId: 2,
    partId: 1,
  },
  {
    materialId: 3,
    partId: 2,
  },
  {
    materialId: 4,
    partId: 3,
  },
  {
    materialId: 2,
    partId: 4,
  },
];

export const mockPartFeatures: Array<BasePartFeature> = [
  { feature: "Rosca M8 en ambos extremos", id: 1, maxValue: null, minValue: null, partId: 1 },
  { feature: "Chaflán de 1 mm", id: 2, maxValue: null, minValue: null, partId: 1 },
  { feature: "Taladro pasante de 6 mm", id: 3, maxValue: null, minValue: null, partId: 2 },
  { feature: "Longitud de 12 mm", id: 4, maxValue: "12.1", minValue: "11.9", partId: 1 },
  { feature: "Temperatura mínima de -0,5 ºC", id: 5, maxValue: null, minValue: "-0.5", partId: 1 },
  { feature: "Rugosidad máxima de 1,6", id: 6, maxValue: "1.6", minValue: null, partId: 1 },
  { feature: "Planitud entre -0,5 y 0,5", id: 7, maxValue: "0.5", minValue: "-0.5", partId: 2 },
];

export const mockPartPriceEstimators: Array<BasePartPriceEstimator> = [
  {
    coatingCost: "0.05",
    machinePricePerHour: 32,
    machineSetupTimeMinutes: 15,
    materialCost: null,
    materialId: 3,
    partId: 2,
    partLength: "14",
    partsPerHour: 180,
    otherCost: null,
    secondOperationCost: null,
    transportPercentage: "2",
    unexpectedPercentage: "1",
    wastePercentage: "2",
  },
  {
    coatingCost: null,
    machinePricePerHour: 29,
    machineSetupTimeMinutes: 30,
    materialCost: null,
    materialId: 1,
    partId: 1,
    partLength: "12",
    partsPerHour: 250,
    otherCost: "0.02",
    secondOperationCost: null,
    transportPercentage: "1.5",
    unexpectedPercentage: "1",
    wastePercentage: "3",
  },
  {
    coatingCost: null,
    machinePricePerHour: 40,
    machineSetupTimeMinutes: 45,
    materialCost: null,
    materialId: 4,
    partId: 3,
    partLength: "80",
    partsPerHour: 90,
    otherCost: null,
    secondOperationCost: "0.1",
    transportPercentage: "2",
    unexpectedPercentage: "2",
    wastePercentage: "4",
  },
  {
    coatingCost: "0.08",
    machinePricePerHour: 35,
    machineSetupTimeMinutes: 20,
    materialCost: null,
    materialId: 2,
    partId: 4,
    partLength: "4",
    partsPerHour: 400,
    otherCost: null,
    secondOperationCost: null,
    transportPercentage: "1",
    unexpectedPercentage: "0.5",
    wastePercentage: "2.5",
  },
  {
    coatingCost: "0.12",
    machinePricePerHour: 30,
    machineSetupTimeMinutes: 10,
    materialCost: "1.25",
    materialId: null,
    partId: 5,
    partLength: "10",
    partsPerHour: 150,
    otherCost: "0.05",
    secondOperationCost: "0.2",
    transportPercentage: "2",
    unexpectedPercentage: "1",
    wastePercentage: "2",
  },
  {
    coatingCost: null,
    machinePricePerHour: 32,
    machineSetupTimeMinutes: 15,
    materialCost: "0.6",
    materialId: null,
    partId: 6,
    partLength: "5",
    partsPerHour: 300,
    otherCost: null,
    secondOperationCost: null,
    transportPercentage: "1",
    unexpectedPercentage: "1",
    wastePercentage: "2",
  },
];

export const mockPartReferences: Array<BasePartReference> = [
  {
    clientDescription: "Id 1, part 1, client 1",
    clientId: 1,
    deletedAt: null,
    id: 1,
    partId: 1,
    reference: "ID-1-P1-C1",
  },
  {
    clientDescription: "Id 2, part 1, client 1",
    clientId: 1,
    deletedAt: null,
    id: 2,
    partId: 1,
    reference: "ID-2-P1-C1",
  },
  {
    clientDescription: "Id 3, part 2, client 2",
    clientId: 2,
    deletedAt: null,
    id: 3,
    partId: 2,
    reference: "ID-3-P2-C2",
  },
  {
    clientDescription: "Id 4, part 3, client 2",
    clientId: 2,
    deletedAt: null,
    id: 4,
    partId: 3,
    reference: "ID-4-P3-C2",
  },
  {
    clientDescription: "Id 5, part 4, client 1",
    clientId: 1,
    deletedAt: null,
    id: 5,
    partId: 4,
    reference: "ID-5-P4-C1",
  },
  {
    clientDescription: "DELETED-P5-C1",
    clientId: 1,
    deletedAt: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 10),
    id: 6,
    partId: 5,
    reference: "ID-6-P5-C1",
  },
  {
    clientDescription: "Id 7, part 1, client 2",
    clientId: 2,
    deletedAt: null,
    id: 7,
    partId: 1,
    reference: "ID-7-P1-C2",
  },
  {
    clientDescription: "Id 8, part 6, client 1",
    clientId: 1,
    deletedAt: null,
    id: 8,
    partId: 6,
    reference: "ID-8-P6-C1",
  },
  {
    clientDescription: "Id 9, part 6, no client",
    clientId: null,
    deletedAt: null,
    id: 9,
    partId: 6,
    reference: "ID-9-P6-CNULL",
  },
  {
    // Only reachable by Client 1 through includePartReferenceNullClientId
    clientDescription: "Id 10, part 3, no client",
    clientId: null,
    deletedAt: null,
    id: 10,
    partId: 3,
    reference: "ID-10-P3-CNULL",
  },
  {
    // Deleted, so it must not make part 2 reachable by Client 1
    clientDescription: "DELETED-P2-CNULL",
    clientId: null,
    deletedAt: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 10),
    id: 11,
    partId: 2,
    reference: "ID-11-P2-CNULL",
  },
];

export const mockSellOrders: Array<BaseSellOrder> = [
  {
    // Has 2 completed lines
    clientId: 1,
    clientReference: "ID-1-C1-PM1",
    deletedAt: null,
    fileUploadedAt: new Date(MOCK_INITIAL_DATE),
    id: 1,
    notes: "Pedido urgente",
    paymentMethodId: 1,
    receptionDate: new Date(MOCK_INITIAL_DATE),
  },
  {
    // Has 1 pending line
    clientId: 2,
    clientReference: "ID-2-C2-PM2",
    deletedAt: null,
    fileUploadedAt: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 3),
    id: 2,
    notes: null,
    paymentMethodId: 2,
    receptionDate: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 3),
  },
  {
    // Has 1 completed line
    clientId: 1,
    clientReference: "ID-3-C1-PM3",
    deletedAt: null,
    fileUploadedAt: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 7),
    id: 3,
    notes: "Pedido regular",
    paymentMethodId: null,
    receptionDate: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 7),
  },
  {
    // Has 1 partially served line
    clientId: 1,
    clientReference: "ID-4-C1-PM4",
    deletedAt: null,
    fileUploadedAt: null,
    id: 4,
    notes: null,
    paymentMethodId: 1,
    receptionDate: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS),
  },
  {
    // Has 1 completed line and 1 pending line
    clientId: 1,
    clientReference: "ID-5-C1-PM5",
    deletedAt: null,
    fileUploadedAt: null,
    id: 5,
    notes: "Pedido con dos líneas de la misma pieza con distintas fechas de entrega",
    paymentMethodId: 1,
    receptionDate: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS),
  },
  {
    // Deleted sell order
    clientId: 1,
    clientReference: "DELETED-ID-6-C1-PM6",
    deletedAt: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS),
    fileUploadedAt: null,
    id: 6,
    notes: "DELETED SELL ORDER",
    paymentMethodId: 1,
    receptionDate: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 2),
  },
];

export const mockSellOrderLines: Array<BaseSellOrderLine> = [
  {
    // Client 1, part 1. Fully served in delivery note line 1
    deletedAt: null,
    description: null,
    id: 1,
    notes: null,
    partPrice: "9.5",
    partReferenceId: 1,
    pendingQuantity: 0,
    quantity: 10,
    requestedDeliveryDate: new Date(MOCK_INITIAL_DATE),
    sellOrderId: 1,
  },
  {
    // Client 1, part 6. Pending
    deletedAt: null,
    description: null,
    id: 2,
    notes: "Embalar por separado",
    partPrice: null,
    partReferenceId: 8,
    pendingQuantity: 20,
    quantity: 20,
    requestedDeliveryDate: null,
    sellOrderId: 1,
  },
  {
    // Client 2, part 2. Fully served in delivery note line 2, delivery note 2
    deletedAt: null,
    description: null,
    id: 3,
    notes: null,
    partPrice: "25.75",
    partReferenceId: 3,
    pendingQuantity: 0,
    quantity: 5,
    requestedDeliveryDate: new Date(MOCK_INITIAL_DATE.getTime() + DAY_IN_MS * 2),
    sellOrderId: 2,
  },
  {
    // Client 1, part 1. Delivered with quantity=40 in the delivery note line 3, delivery note 3
    deletedAt: null,
    description: null,
    id: 4,
    notes: null,
    partPrice: "9.99",
    partReferenceId: 2,
    pendingQuantity: 0,
    quantity: 30,
    requestedDeliveryDate: null,
    sellOrderId: 3,
  },
  {
    // Client 1, part 1. Served partially in delivery note line 3
    deletedAt: null,
    description: null,
    id: 5,
    notes: null,
    partPrice: "10.5",
    partReferenceId: 1,
    pendingQuantity: 5,
    quantity: 10,
    requestedDeliveryDate: null,
    sellOrderId: 4,
  },
  {
    deletedAt: null,
    description: null,
    id: 6,
    notes: null,
    partPrice: "10.5",
    partReferenceId: 1,
    pendingQuantity: 0,
    quantity: 33,
    requestedDeliveryDate: new Date(MOCK_INITIAL_DATE.getTime() + DAY_IN_MS),
    sellOrderId: 5,
  },
  {
    deletedAt: null,
    description: null,
    id: 7,
    notes: null,
    partPrice: "10.5",
    partReferenceId: 1,
    pendingQuantity: 0,
    quantity: 33,
    requestedDeliveryDate: new Date(MOCK_INITIAL_DATE.getTime() + DAY_IN_MS * 7),
    sellOrderId: 5,
  },
  // Sell order 6 is deleted
  {
    deletedAt: null,
    description: null,
    id: 8,
    notes: null,
    partPrice: "10.5",
    partReferenceId: 1,
    pendingQuantity: 1,
    quantity: 1,
    requestedDeliveryDate: new Date(MOCK_INITIAL_DATE.getTime() + DAY_IN_MS * 7),
    sellOrderId: 6,
  },
  {
    // Client 1, part 6 through the null client reference 9, so it is delivered along with line 2. Pending
    deletedAt: null,
    description: null,
    id: 9,
    notes: null,
    partPrice: "3.25",
    partReferenceId: 9,
    pendingQuantity: 3,
    quantity: 3,
    requestedDeliveryDate: null,
    sellOrderId: 1,
  },
  {
    // Client 2, part 3. Deleted while pending, so its production order is deleted along with it
    deletedAt: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS),
    description: null,
    id: 10,
    notes: null,
    partPrice: null,
    partReferenceId: 4,
    pendingQuantity: 5,
    quantity: 5,
    requestedDeliveryDate: null,
    sellOrderId: 2,
  },
];

export const mockDeliveryNotes: Array<BaseDeliveryNote> = [
  {
    clientId: 1,
    createdAt: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 5),
    deliveryDate: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 5),
    deliveryMethodId: 1,
    id: 1,
    invoiceId: null,
  },
  {
    clientId: 2,
    createdAt: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 2),
    deliveryDate: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 2),
    deliveryMethodId: 3,
    id: 2,
    invoiceId: null,
  },
  {
    clientId: 1,
    createdAt: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS),
    deliveryDate: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS),
    deliveryMethodId: 2,
    id: 3,
    invoiceId: null,
  },
  // Delivery notes 4 to 9 are already invoiced
  {
    // Invoice 1, which mixes VAT rates
    clientId: 1,
    createdAt: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 45),
    deliveryDate: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 45),
    deliveryMethodId: 1,
    id: 4,
    invoiceId: 1,
  },
  {
    // Invoice 1
    clientId: 1,
    createdAt: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 42),
    deliveryDate: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 42),
    deliveryMethodId: 2,
    id: 5,
    invoiceId: 1,
  },
  {
    // Invoice 2, the only delivery note of an accounted invoice
    clientId: 1,
    createdAt: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 75),
    deliveryDate: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 75),
    deliveryMethodId: null,
    id: 6,
    invoiceId: 2,
  },
  {
    // Invoice 3, whose lines are exempt or have a reduced VAT
    clientId: 2,
    createdAt: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 35),
    deliveryDate: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 35),
    deliveryMethodId: 3,
    id: 7,
    invoiceId: 3,
  },
  {
    // Invoice 4, with a line that has no price
    clientId: 2,
    createdAt: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 14),
    deliveryDate: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 14),
    deliveryMethodId: 1,
    id: 8,
    invoiceId: 4,
  },
  {
    // Invoice 4, without lines
    clientId: 2,
    createdAt: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 12),
    deliveryDate: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 12),
    deliveryMethodId: null,
    id: 9,
    invoiceId: 4,
  },
];

export const mockPendingDeliveryNotes = mockDeliveryNotes.filter((deliveryNote) => deliveryNote.invoiceId === null);

export const mockInvoices: Array<BaseInvoice> = [
  {
    // Not accounted yet, with a payment deadline that has not passed
    accounted: false,
    clientId: 1,
    createdAt: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 40),
    dueDate: new Date(MOCK_INITIAL_DATE.getTime() + DAY_IN_MS * 5),
    id: 1,
    paymentMethodId: 1,
    sent: false,
  },
  {
    // Accounted, with a payment deadline that has passed
    accounted: true,
    clientId: 1,
    createdAt: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 70),
    dueDate: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 40),
    id: 2,
    paymentMethodId: 3,
    sent: true,
  },
  {
    // Accounted, without payment method, due the day it was created
    accounted: true,
    clientId: 2,
    createdAt: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 30),
    dueDate: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 30),
    id: 3,
    paymentMethodId: null,
    sent: true,
  },
  {
    // Not accounted, with a payment method without payment deadline, due the day it was created
    accounted: false,
    clientId: 2,
    createdAt: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 10),
    dueDate: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 10),
    id: 4,
    paymentMethodId: 2,
    sent: false,
  },
];

export const mockDeliveryNoteLines: Array<BaseDeliveryNoteLine> = [
  {
    deliveryNoteId: 1,
    description: mockParts[0].description,
    id: 1,
    partReferenceId: 1,
    quantity: 10,
    sellOrderLineId: 1,
    unitPrice: null,
    vatPercentage: 21,
  },
  {
    deliveryNoteId: 2,
    description: mockPartReferences[2].clientDescription,
    id: 2,
    partReferenceId: 3,
    quantity: 5,
    sellOrderLineId: 3,
    unitPrice: null,
    vatPercentage: 21,
  },
  {
    deliveryNoteId: 3,
    description: mockParts[0].description,
    id: 3,
    partReferenceId: 1,
    quantity: 40,
    sellOrderLineId: 5,
    unitPrice: null,
    vatPercentage: 21,
  },
  {
    deliveryNoteId: 1,
    description: mockParts[0].description,
    id: 4,
    partReferenceId: 1,
    quantity: 333,
    sellOrderLineId: 5,
    unitPrice: null,
    vatPercentage: 10,
  },
  {
    deliveryNoteId: 4,
    description: mockParts[0].description,
    id: 5,
    partReferenceId: 1,
    quantity: 100,
    sellOrderLineId: 5,
    unitPrice: null,
    vatPercentage: 21,
  },
  {
    deliveryNoteId: 4,
    description: mockPartReferences[1].clientDescription,
    id: 6,
    partReferenceId: 2,
    quantity: 7,
    sellOrderLineId: 4,
    unitPrice: null,
    vatPercentage: 10,
  },
  {
    deliveryNoteId: 5,
    description: mockParts[0].description,
    id: 7,
    partReferenceId: 1,
    quantity: 33,
    sellOrderLineId: 6,
    unitPrice: null,
    vatPercentage: 21,
  },
  {
    deliveryNoteId: 6,
    description: mockParts[0].description,
    id: 8,
    partReferenceId: 1,
    quantity: 33,
    sellOrderLineId: 7,
    unitPrice: null,
    vatPercentage: 21,
  },
  {
    deliveryNoteId: 7,
    description: mockPartReferences[2].clientDescription,
    id: 9,
    partReferenceId: 3,
    quantity: 4,
    sellOrderLineId: 3,
    unitPrice: null,
    vatPercentage: 0,
  },
  {
    deliveryNoteId: 7,
    description: mockPartReferences[2].clientDescription,
    id: 10,
    partReferenceId: 3,
    quantity: 1,
    sellOrderLineId: 3,
    unitPrice: null,
    vatPercentage: 4,
  },
  {
    deliveryNoteId: 8,
    description: mockPartReferences[3].clientDescription,
    id: 11,
    partReferenceId: 4,
    quantity: 12,
    sellOrderLineId: null,
    unitPrice: null,
    vatPercentage: 21,
  },
  {
    // Invoice 1, a line without Artículo nor Pedido de venta, with a price of its own that rounds half a cent up
    deliveryNoteId: 5,
    description: "Portes",
    id: 12,
    partReferenceId: null,
    quantity: 3,
    sellOrderLineId: null,
    unitPrice: "15.005",
    vatPercentage: 21,
  },
];

export const mockBlueprints: Array<BaseBlueprint> = [
  {
    createdAt: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 7),
    fileName: "ID-1-BLUEPRINT1",
    id: 1,
    partId: 1,
  },
  {
    createdAt: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 14),
    fileName: "ID-2-BLUEPRINT2",
    id: 2,
    partId: 2,
  },
  {
    createdAt: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS),
    fileName: "ID-3-BLUEPRINT3",
    id: 3,
    partId: 1,
  },
  {
    createdAt: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 21),
    fileName: "ID-4-BLUEPRINT4",
    id: 4,
    partId: 3,
  },
  {
    createdAt: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 3),
    fileName: "ID-5-Crispin",
    id: 5,
    partId: 6,
  },
];

export const mockProductionOrders: Array<BaseProductionOrder> = [
  {
    // Status: Completed
    createdAt: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 3),
    deletedAt: null,
    id: 1,
    notes: "ID-1-P1 Primera orden de producción para la pieza 1, ya ha sido fabricada",
    partId: 1,
    qualityControl: true,
    quantity: 10,
    sellOrderLineId: 1,
  },
  {
    // Status: Pending
    createdAt: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS),
    deletedAt: null,
    id: 2,
    notes: "ID-2-P6 Son dos lotes de 20 unidades cada uno",
    partId: 6,
    qualityControl: false,
    quantity: 40,
    sellOrderLineId: 2,
  },
  {
    // Status: Completed
    createdAt: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 4),
    deletedAt: null,
    id: 3,
    notes: "ID-3-P2 Finalmente se han fabricado 8 unidades de Casquillo separador",
    partId: 2,
    qualityControl: true,
    quantity: 5,
    sellOrderLineId: 3,
  },
  {
    // Status: Cancelled
    createdAt: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 10),
    deletedAt: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 5),
    id: 4,
    notes: "ID-4-P1 Orden de producción cancelada",
    partId: 1,
    qualityControl: false,
    quantity: 666,
    sellOrderLineId: 4,
  },
  {
    // Status: InProduction
    createdAt: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 2),
    deletedAt: null,
    id: 5,
    notes: "ID-5-P1 El pedido eran 10 unidades, se entregaron 5. Quedan 5 pendientes. Dejar otro lote",
    partId: 1,
    qualityControl: true,
    quantity: 15,
    sellOrderLineId: 5,
  },
  {
    // status: Pending
    createdAt: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS),
    deletedAt: null,
    id: 6,
    notes: "ID-6-P3 Buje del eje, orden de producción para stock",
    partId: 3,
    qualityControl: true,
    quantity: 50,
    sellOrderLineId: null,
  },
  {
    // Status: Completed, without a quantity it is done once a machine finishes it having produced something
    createdAt: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 16),
    deletedAt: null,
    id: 7,
    notes: "ID-7-P3 Buje del eje para stock, sin cantidad",
    partId: 3,
    qualityControl: false,
    quantity: null,
    sellOrderLineId: null,
  },
  {
    // Status: Pending, without a quantity and nothing produced yet
    createdAt: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS),
    deletedAt: null,
    id: 8,
    notes: "ID-8-P3 Buje del eje para stock, sin cantidad y sin empezar",
    partId: 3,
    qualityControl: false,
    quantity: null,
    sellOrderLineId: null,
  },
  {
    // Status: SellOrderDeleted, its sell order 6 is deleted
    createdAt: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 2),
    deletedAt: null,
    id: 9,
    notes: "ID-9-P1 Orden de producción de un pedido eliminado",
    partId: 1,
    qualityControl: false,
    quantity: 1,
    sellOrderLineId: 8,
  },
  {
    // Status: SellOrderLineDeleted, its sell order line 10 is deleted
    createdAt: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 2),
    deletedAt: null,
    id: 10,
    notes: "ID-10-P3 Orden de producción de una línea eliminada",
    partId: 3,
    qualityControl: false,
    quantity: 5,
    sellOrderLineId: 10,
  },
  {
    // Status: PendingTreatment, its part 4 has a coating and nothing produced has been sent to the treatment
    createdAt: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 3),
    deletedAt: null,
    id: 11,
    notes: "ID-11-P4 Fabricada, pendiente de enviar al tratamiento",
    partId: 4,
    qualityControl: false,
    quantity: 6,
    sellOrderLineId: null,
  },
];

export const mockMachines: Array<BaseMachine> = [
  {
    activeProductionOrderId: 5,
    deletedAt: null,
    id: 1,
    maxDiameter: null,
    minDiameter: null,
    name: "ID-1 Torno pequeño",
  },
  {
    activeProductionOrderId: null,
    deletedAt: null,
    id: 2,
    maxDiameter: null,
    minDiameter: null,
    name: "ID-2 Torno grande",
  },
  {
    activeProductionOrderId: null,
    deletedAt: null,
    id: 3,
    maxDiameter: null,
    minDiameter: null,
    name: "ID-3 Plegadora",
  },
];

export const mockMachineProductionOrderQueues: Array<BaseMachineProductionOrderQueue> = [
  {
    machineId: 2,
    productionOrderId: 2,
    timestamp: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 2),
  },
  {
    machineId: 1,
    productionOrderId: 5,
    timestamp: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS),
  },
  {
    machineId: 1,
    productionOrderId: 6,
    timestamp: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 3),
  },
];

// The stock transactions of a part never share a date, so the order of its ledger does not depend on the query
export const mockPartProduction: Array<BasePartProduction> = [
  {
    date: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 5 + HOUR_IN_MS * 12),
    id: 1,
    machineId: 1,
    productionOrderId: 1,
    quantity: 15,
  },
  {
    date: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 3),
    id: 2,
    machineId: 1,
    productionOrderId: 3,
    quantity: 8,
  },
  {
    date: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 4),
    id: 3,
    machineId: 2,
    productionOrderId: 5,
    quantity: 5,
  },
  {
    // Before the 12 units delivered of part 3, so it delivers more than its stock
    date: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 16 + HOUR_IN_MS * 6),
    id: 4,
    machineId: 2,
    productionOrderId: 7,
    quantity: 10,
  },
  {
    date: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 2 + HOUR_IN_MS * 6),
    id: 5,
    machineId: 3,
    productionOrderId: 11,
    quantity: 6,
  },
];

export const mockPartStock: Array<BasePartStock> = [
  {
    date: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS + HOUR_IN_MS * 12),
    id: 1,
    partId: 1,
    quantity: 10,
  },
  {
    date: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 7),
    id: 2,
    partId: 2,
    quantity: 0,
  },
  {
    date: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 3 + HOUR_IN_MS * 12),
    id: 3,
    partId: 2,
    quantity: 7,
  },
  {
    // More than both pending Líneas of part 6 together, so the stock shows whether both of them were delivered
    date: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 2),
    id: 4,
    partId: 6,
    quantity: 50,
  },
];

const MOCK_TREATMENT_BATCH_1_SENT_AT = new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 2 + HOUR_IN_MS * 9);
const MOCK_TREATMENT_BATCH_2_SENT_AT = new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS + HOUR_IN_MS * 15);

// Batch 1 came fully back. Batch 2 is still out, partially received. Production order 3 is in both batches, and its
// production order 5 is still running on a machine. Production order 1 sent and got back more parts than it produced
export const mockTreatmentShipments: Array<BaseTreatmentShipment> = [
  { id: 1, partId: 1, productionOrderId: 1, quantity: 17, sentAt: MOCK_TREATMENT_BATCH_1_SENT_AT },
  { id: 2, partId: 2, productionOrderId: 3, quantity: 2, sentAt: MOCK_TREATMENT_BATCH_1_SENT_AT },
  { id: 3, partId: 2, productionOrderId: 3, quantity: 5, sentAt: MOCK_TREATMENT_BATCH_2_SENT_AT },
  { id: 4, partId: 1, productionOrderId: 5, quantity: 3, sentAt: MOCK_TREATMENT_BATCH_2_SENT_AT },
];

export const mockTreatmentReceptions: Array<BaseTreatmentReception> = [
  {
    id: 1,
    quantity: 17,
    receivedAt: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS + HOUR_IN_MS * 9),
    treatmentShipmentId: 1,
  },
  {
    id: 2,
    quantity: 2,
    receivedAt: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS + HOUR_IN_MS * 9),
    treatmentShipmentId: 2,
  },
  { id: 3, quantity: 2, receivedAt: new Date(MOCK_INITIAL_DATE.getTime() - HOUR_IN_MS * 3), treatmentShipmentId: 3 },
];

// Orden de producción 1 passes its only check, 5 mixes failed and passed Características over several checks (one of
// 0 units), 3 has none yet, and 6 has no Características to check
export const mockQualityChecks: Array<BaseQualityCheck> = [
  {
    checkedAt: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 5),
    id: 1,
    notes: null,
    ok: true,
    partFeatureId: 1,
    producedQuantity: 15,
    productionOrderId: 1,
    value: null,
  },
  {
    checkedAt: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 5),
    id: 2,
    notes: null,
    ok: true,
    partFeatureId: 2,
    producedQuantity: 15,
    productionOrderId: 1,
    value: null,
  },
  {
    checkedAt: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 4),
    id: 3,
    notes: null,
    ok: true,
    partFeatureId: 1,
    producedQuantity: 0,
    productionOrderId: 5,
    value: null,
  },
  {
    checkedAt: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 4),
    id: 4,
    notes: null,
    ok: false,
    partFeatureId: 2,
    producedQuantity: 0,
    productionOrderId: 5,
    value: null,
  },
  {
    checkedAt: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 3),
    id: 5,
    notes: "Rosca fuera de tolerancia",
    ok: false,
    partFeatureId: 1,
    producedQuantity: 3,
    productionOrderId: 5,
    value: null,
  },
  {
    checkedAt: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 3),
    id: 6,
    notes: null,
    ok: true,
    partFeatureId: 2,
    producedQuantity: 3,
    productionOrderId: 5,
    value: null,
  },
  {
    checkedAt: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 2),
    id: 7,
    notes: null,
    ok: true,
    partFeatureId: 1,
    producedQuantity: 5,
    productionOrderId: 5,
    value: null,
  },
  {
    checkedAt: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 2),
    id: 8,
    notes: null,
    ok: true,
    partFeatureId: 2,
    producedQuantity: 5,
    productionOrderId: 5,
    value: null,
  },
  {
    checkedAt: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 3),
    id: 9,
    notes: "Fuera de tolerancia",
    ok: false,
    partFeatureId: 4,
    producedQuantity: 3,
    productionOrderId: 5,
    value: "12.40",
  },
  {
    checkedAt: new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 2),
    id: 10,
    notes: null,
    ok: true,
    partFeatureId: 4,
    producedQuantity: 5,
    productionOrderId: 5,
    value: "12.05",
  },
];
