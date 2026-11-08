import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  numeric,
  primaryKey,
  pgTable,
  text,
  uniqueIndex,
  timestamp,
  boolean,
} from "drizzle-orm/pg-core";
import type { PgColumn } from "drizzle-orm/pg-core";

// With time zone so Electric sends the offset, otherwise browsers parse the UTC values as local time
const datetimeType = (colName: string) => timestamp(colName, { withTimezone: true });
const deletedAtType = datetimeType("deletedAt");
const idType = integer("id").generatedByDefaultAsIdentity({ startWith: 1 }).primaryKey();

const activeNameIndex = (tableName: string) => `unique_${tableName}_name_active` as const;
const uniqueIndexByName = (table: { name: PgColumn; deletedAt: PgColumn }, tableName: string) =>
  uniqueIndex(activeNameIndex(tableName))
    .on(table.name)
    .where(sql`${table.deletedAt} IS NULL`);

export const COATING_NAME_CONSTRAINT = activeNameIndex("coating");
export const SHAPE_NAME_CONSTRAINT = "unique_shape_name";
export const RAW_MATERIAL_NAME_CONSTRAINT = activeNameIndex("raw_material");
export const MACHINE_NAME_CONSTRAINT = activeNameIndex("machine");
export const PAYMENT_METHOD_NAME_CONSTRAINT = activeNameIndex("payment_method");
export const DELIVERY_METHOD_NAME_CONSTRAINT = activeNameIndex("delivery_method");
export const CLIENT_NAME_CONSTRAINT = activeNameIndex("client");
export const MATERIAL_COMBINATION_CONSTRAINT = "material_combination";
export const SELL_ORDER_REFERENCE_CONSTRAINT = "sell_order_reference_by_client";
export const PART_MATERIAL_CONSTRAINT = "part_material_pkey";
export const MACHINE_PRODUCTION_ORDER_QUEUE_CONSTRAINT = "machine_production_order_queue_pkey";

export const dbTableConfiguration = pgTable("configuration", {
  address: text("address"),
  bankAccount: text("bankAccount"),
  city: text("city"),
  email: text("email"),
  id: idType,
  invoiceFootnote: text("invoiceFootnote"),
  invoiceSenderEmail: text("invoiceSenderEmail"),
  legalName: text("legalName").notNull(),
  phone: text("phone"),
  postalCode: text("postalCode"),
  province: text("province"),
  taxId: text("taxId"),
  vatPercentage: integer("vatPercentage").notNull(),
  website: text("website"),
});

export const dbTableCoating = pgTable(
  "coating",
  {
    deletedAt: deletedAtType,
    id: idType,
    name: text("name").notNull(),
  },
  (table) => [uniqueIndexByName(table, "coating")],
);

export const dbTableShape = pgTable(
  "shape",
  {
    id: idType,
    name: text("name").notNull(),
  },
  (table) => [uniqueIndex(SHAPE_NAME_CONSTRAINT).on(table.name)],
);

export const dbTableRawMaterial = pgTable(
  "raw_material",
  {
    deletedAt: deletedAtType,
    density: numeric("density"),
    id: idType,
    name: text("name").notNull(),
    price: numeric("price"),
  },
  (table) => [uniqueIndexByName(table, "raw_material")],
);

export const dbTableMaterial = pgTable(
  "material",
  {
    deletedAt: deletedAtType,
    id: idType,
    rawMaterialId: integer("rawMaterialId")
      .references(() => dbTableRawMaterial.id)
      .notNull(),
    shapeId: integer("shapeId").references(() => dbTableShape.id),
    width: numeric("width").notNull(),
  },
  (table) => [
    uniqueIndex(MATERIAL_COMBINATION_CONSTRAINT)
      .on(table.width, table.shapeId, table.rawMaterialId)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

export const dbTableMachine = pgTable(
  "machine",
  {
    activeProductionOrderId: integer("activeProductionOrderId").references(() => dbTableProductionOrder.id),
    deletedAt: deletedAtType,
    id: idType,
    maxDiameter: integer("maxDiameter"),
    minDiameter: integer("minDiameter"),
    name: text("name").notNull(),
  },
  (table) => [uniqueIndexByName(table, "machine")],
);

export const dbTablePartProduction = pgTable("part_production", {
  date: datetimeType("date").notNull(),
  id: idType,
  machineId: integer("machineId")
    .notNull()
    .references(() => dbTableMachine.id),
  productionOrderId: integer("productionOrderId")
    .notNull()
    .references(() => dbTableProductionOrder.id),
  quantity: integer("quantity").notNull(),
});

export const dbTableMachineProductionOrderQueue = pgTable(
  "machine_production_order_queue",
  {
    machineId: integer("machineId")
      .notNull()
      .references(() => dbTableMachine.id),
    productionOrderId: integer("productionOrderId")
      .notNull()
      .references(() => dbTableProductionOrder.id),
    timestamp: datetimeType("timestamp").notNull(),
  },
  (table) => [primaryKey({ columns: [table.machineId, table.productionOrderId] })],
);

export const dbTablePaymentMethod = pgTable(
  "payment_method",
  {
    deletedAt: deletedAtType,
    generatesReceipt: boolean("generatesReceipt").notNull().default(false),
    id: idType,
    name: text("name").notNull(),
    paymentDeadlineDays: integer("paymentDeadlineDays"),
  },
  (table) => [uniqueIndexByName(table, "payment_method")],
);

export const dbTableDeliveryMethod = pgTable(
  "delivery_method",
  {
    deletedAt: deletedAtType,
    id: idType,
    name: text("name").notNull(),
  },
  (table) => [uniqueIndexByName(table, "delivery_method")],
);

export const dbTableClient = pgTable(
  "client",
  {
    address: text("address").notNull(),
    city: text("city").notNull(),
    country: text("country"),
    defaultDeliveryMethodId: integer("defaultDeliveryMethodId").references(() => dbTableDeliveryMethod.id),
    defaultPaymentMethodId: integer("defaultPaymentMethodId").references(() => dbTablePaymentMethod.id),
    deletedAt: deletedAtType,
    iban: text("iban"),
    id: idType,
    legalName: text("legalName").notNull(),
    name: text("name").notNull(),
    phone: text("phone"),
    postalCode: text("postalCode").notNull(),
    prismaAccountingAccountId: text("prismaAccountingAccountId"),
    province: text("province"),
    taxId: text("taxId").notNull(),
  },
  (table) => [uniqueIndexByName(table, "client")],
);

export const dbTablePart = pgTable("part", {
  coatingId: integer("coatingId").references(() => dbTableCoating.id),
  deletedAt: deletedAtType,
  description: text("description").notNull(),
  id: idType,
  length: text("length"),
  notes: text("notes"),
  shapeId: integer("shapeId").references(() => dbTableShape.id),
  width: text("width"),
});

export const dbTablePartStock = pgTable("part_stock", {
  date: datetimeType("date").notNull(),
  id: idType,
  partId: integer("partId")
    .notNull()
    .references(() => dbTablePart.id),
  quantity: integer("quantity").notNull(),
});

export const CLIENT_INVOICE_EMAIL_CONSTRAINT = "unique_client_invoice_email";
export const dbTableClientInvoiceEmail = pgTable(
  "client_invoice_email",
  {
    clientId: integer("clientId")
      .notNull()
      .references(() => dbTableClient.id),
    email: text("email").notNull(),
    id: idType,
  },
  (table) => [uniqueIndex(CLIENT_INVOICE_EMAIL_CONSTRAINT).on(table.clientId, table.email)],
);

export const dbTableSellOrder = pgTable(
  "sell_order",
  {
    clientId: integer("clientId")
      .notNull()
      .references(() => dbTableClient.id),
    clientReference: text("clientReference"),
    deletedAt: deletedAtType,
    fileUploadedAt: datetimeType("fileUploadedAt"),
    id: idType,
    notes: text("notes"),
    paymentMethodId: integer("paymentMethodId").references(() => dbTablePaymentMethod.id),
    receptionDate: datetimeType("receptionDate").notNull(),
  },
  (table) => [
    uniqueIndex(SELL_ORDER_REFERENCE_CONSTRAINT)
      .on(table.clientId, table.clientReference)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

export const SELL_ORDER_LINE_ITEM_CONSTRAINT = "sell_order_line_item_check";
export const dbTableSellOrderLine = pgTable(
  "sell_order_line",
  {
    deletedAt: deletedAtType,
    description: text("description"),
    id: idType,
    notes: text("notes"),
    partPrice: numeric("partPrice"),
    partReferenceId: integer("partReferenceId").references(() => dbTablePartReference.id),
    pendingQuantity: integer("pendingQuantity").notNull(),
    quantity: integer("quantity").notNull(),
    requestedDeliveryDate: datetimeType("requestedDeliveryDate"),
    sellOrderId: integer("sellOrderId")
      .notNull()
      .references(() => dbTableSellOrder.id),
  },
  (table) => [
    // A Línea without Artículo is described by hand
    check(SELL_ORDER_LINE_ITEM_CONSTRAINT, sql`num_nonnulls(${table.partReferenceId}, ${table.description}) = 1`),
  ],
);

export const dbTableInvoice = pgTable("invoice", {
  accounted: boolean("accounted").notNull(),
  clientId: integer("clientId")
    .notNull()
    .references(() => dbTableClient.id),
  createdAt: datetimeType("createdAt").notNull(),
  dueDate: datetimeType("dueDate").notNull(),
  id: idType,
  paymentMethodId: integer("paymentMethodId").references(() => dbTablePaymentMethod.id),
  sent: boolean("sent").notNull(),
});

export const dbTableDeliveryNote = pgTable("delivery_note", {
  clientId: integer("clientId")
    .notNull()
    .references(() => dbTableClient.id),
  createdAt: datetimeType("createdAt").notNull(),
  deliveryDate: datetimeType("deliveryDate"),
  deliveryMethodId: integer("deliveryMethodId").references(() => dbTableDeliveryMethod.id),
  id: idType,
  invoiceId: integer("invoiceId").references(() => dbTableInvoice.id),
});

export const dbTableDeliveryNoteLine = pgTable("delivery_note_line", {
  deliveryNoteId: integer("deliveryNoteId")
    .notNull()
    .references(() => dbTableDeliveryNote.id),
  description: text("description").notNull(),
  id: idType,
  partReferenceId: integer("partReferenceId").references(() => dbTablePartReference.id),
  quantity: integer("quantity").notNull(),
  sellOrderLineId: integer("sellOrderLineId").references(() => dbTableSellOrderLine.id),
  unitPrice: numeric("unitPrice"),
  vatPercentage: integer("vatPercentage").notNull(),
});

export const dbTableProductionOrder = pgTable("production_order", {
  createdAt: datetimeType("createdAt").notNull(),
  deletedAt: deletedAtType,
  id: idType,
  notes: text("notes"),
  partId: integer("partId")
    .notNull()
    .references(() => dbTablePart.id),
  qualityControl: boolean("qualityControl").notNull().default(false),
  quantity: integer("quantity"),
  sellOrderLineId: integer("sellOrderLineId").references(() => dbTableSellOrderLine.id),
});

export const TREATMENT_SHIPMENT_QUANTITY_CONSTRAINT = "treatment_shipment_positive_quantity";
// The Artículos sent together share the same sentAt, which identifies their batch. A shipment without an Orden de
// producción sends parts that were not produced by one, like stock or returns
export const dbTableTreatmentShipment = pgTable(
  "treatment_shipment",
  {
    id: idType,
    partId: integer("partId")
      .notNull()
      .references(() => dbTablePart.id),
    productionOrderId: integer("productionOrderId").references(() => dbTableProductionOrder.id),
    quantity: integer("quantity").notNull(),
    sentAt: datetimeType("sentAt").notNull(),
  },
  (table) => [check(TREATMENT_SHIPMENT_QUANTITY_CONSTRAINT, sql`${table.quantity} > 0`)],
);

export const TREATMENT_RECEPTION_QUANTITY_CONSTRAINT = "treatment_reception_positive_quantity";
export const dbTableTreatmentReception = pgTable(
  "treatment_reception",
  {
    id: idType,
    quantity: integer("quantity").notNull(),
    receivedAt: datetimeType("receivedAt").notNull(),
    treatmentShipmentId: integer("treatmentShipmentId")
      .notNull()
      .references(() => dbTableTreatmentShipment.id),
  },
  (table) => [check(TREATMENT_RECEPTION_QUANTITY_CONSTRAINT, sql`${table.quantity} > 0`)],
);

export const PART_FEATURE_CONSTRAINT = "unique_part_feature_name";
export const dbTablePartFeature = pgTable(
  "part_feature",
  {
    feature: text("feature").notNull(),
    id: idType,
    maxValue: numeric("maxValue"),
    minValue: numeric("minValue"),
    partId: integer("partId")
      .notNull()
      .references(() => dbTablePart.id),
  },
  (table) => [uniqueIndex(PART_FEATURE_CONSTRAINT).on(table.partId, table.feature)],
);

export const dbTableQualityCheck = pgTable(
  "quality_check",
  {
    checkedAt: datetimeType("checkedAt").notNull(),
    id: idType,
    notes: text("notes"),
    ok: boolean("ok").notNull(),
    partFeatureId: integer("partFeatureId")
      .notNull()
      .references(() => dbTablePartFeature.id),
    producedQuantity: integer("producedQuantity").notNull(),
    productionOrderId: integer("productionOrderId")
      .notNull()
      .references(() => dbTableProductionOrder.id),
    value: numeric("value"),
  },
  (table) => [index().on(table.productionOrderId), index().on(table.partFeatureId)],
);

export const PART_REFERENCE_CONSTRAINT = "unique_part_reference_active";
export const dbTablePartReference = pgTable(
  "part_reference",
  {
    clientDescription: text("clientDescription").notNull(),
    clientId: integer("clientId").references(() => dbTableClient.id),
    deletedAt: deletedAtType,
    id: idType,
    partId: integer("partId")
      .notNull()
      .references(() => dbTablePart.id),
    reference: text("reference").notNull(),
  },
  (table) => [
    uniqueIndex(PART_REFERENCE_CONSTRAINT)
      .on(table.clientId, table.reference)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

export const dbTablePartPrice = pgTable("part_price", {
  clientId: integer("clientId").references(() => dbTableClient.id),
  createdAt: datetimeType("createdAt"),
  id: idType,
  partId: integer("partId")
    .notNull()
    .references(() => dbTablePart.id),
  price: numeric("price"),
  quantity: integer("quantity"),
});

export const dbTablePartPriceEstimator = pgTable("part_price_estimator", {
  coatingCost: numeric("coatingCost"),
  machinePricePerHour: integer("machinePricePerHour").notNull(),
  machineSetupTimeMinutes: integer("machineSetupTimeMinutes").notNull(),
  materialCost: numeric("materialCost"),
  materialId: integer("materialId").references(() => dbTableMaterial.id),
  partId: integer("partId")
    .primaryKey()
    .references(() => dbTablePart.id),
  partLength: numeric("partLength").notNull(),
  partsPerHour: integer("partsPerHour").notNull(),
  otherCost: numeric("otherCost"),
  secondOperationCost: numeric("secondOperationCost"),
  transportPercentage: numeric("transportPercentage"),
  unexpectedPercentage: numeric("unexpectedPercentage"),
  wastePercentage: numeric("wastePercentage").notNull(),
});

export const dbTablePartMaterial = pgTable(
  "part_material",
  {
    materialId: integer("materialId")
      .notNull()
      .references(() => dbTableMaterial.id),
    partId: integer("partId")
      .notNull()
      .references(() => dbTablePart.id),
  },
  (table) => [primaryKey({ columns: [table.materialId, table.partId] })],
);

export const PART_COMPONENT_CONSTRAINT = "part_component_pkey";
export const PART_COMPONENT_NOT_SELF_CONSTRAINT = "part_component_not_self";
export const PART_COMPONENT_QUANTITY_CONSTRAINT = "part_component_positive_quantity";
// A Conjunto is an Artículo with components; cycles are rejected by the tRPC mutation, a CHECK cannot see other rows
export const dbTablePartComponent = pgTable(
  "part_component",
  {
    componentPartId: integer("componentPartId")
      .notNull()
      .references(() => dbTablePart.id),
    parentPartId: integer("parentPartId")
      .notNull()
      .references(() => dbTablePart.id),
    quantity: integer("quantity").notNull(),
  },
  (table) => [
    primaryKey({ name: PART_COMPONENT_CONSTRAINT, columns: [table.parentPartId, table.componentPartId] }),
    check(PART_COMPONENT_NOT_SELF_CONSTRAINT, sql`${table.parentPartId} <> ${table.componentPartId}`),
    check(PART_COMPONENT_QUANTITY_CONSTRAINT, sql`${table.quantity} > 0`),
    index().on(table.componentPartId),
  ],
);

export const dbTableBlueprint = pgTable("blueprint", {
  createdAt: datetimeType("createdAt"),
  fileName: text("fileName").notNull(),
  id: idType,
  partId: integer("partId")
    .notNull()
    .references(() => dbTablePart.id),
});
