import { z } from "zod";

import {
  decimalFilterSchema,
  nullableIdSchema,
  positiveQuantitySchema,
  requiredIdObjectSchema,
  requiredIdSchema,
  stringSchema,
  tableStateSchema,
  nullableDateSchema,
} from "@/schemas";

const baseProductionOrderSchema = z.object({
  notes: stringSchema({ nullable: true }),
  qualityControl: z.boolean(),
  urgent: z.boolean(),
});

export enum ProductionOrderStatus {
  Completed = "COMPLETED",
  Deleted = "DELETED",
  InProduction = "IN_PRODUCTION",
  InTreatment = "IN_TREATMENT",
  Pending = "PENDING",
  PendingTreatment = "PENDING_TREATMENT",
  SellOrderDeleted = "SELL_ORDER_DELETED",
  SellOrderLineDeleted = "SELL_ORDER_LINE_DELETED",
}
const productionOrderStatusSchema = z.enum(ProductionOrderStatus);

export const productionOrderSchema = baseProductionOrderSchema.extend({
  id: requiredIdSchema,
  partId: requiredIdSchema,
  sellOrderLineId: nullableIdSchema,
  quantity: positiveQuantitySchema.nullable(),
  createdAt: z.coerce.date(),
  deletedAt: nullableDateSchema,
});
export type TProductionOrder = z.infer<typeof productionOrderSchema>;

export const createProductionOrderSchema = baseProductionOrderSchema.extend({
  partId: requiredIdSchema,
  quantity: positiveQuantitySchema.nullable(),
  sellOrderLineId: nullableIdSchema,
});
export type TCreateProductionOrder = z.infer<typeof createProductionOrderSchema>;

export const updateProductionOrderSchema = baseProductionOrderSchema.extend(requiredIdObjectSchema.shape);
export type TUpdateProductionOrder = z.infer<typeof updateProductionOrderSchema>;

export const printTagPartProductionSchema = z.object({
  partQuantity: positiveQuantitySchema,
  productionOrderId: requiredIdSchema,
});

export const updateMachineActiveProductionOrderSchema = z.object({
  machineId: requiredIdSchema,
  productionOrderId: nullableIdSchema,
});

const productionOrderFiltersSchema = z.array(
  z.discriminatedUnion("id", [
    z.object({ id: z.literal("assignedMachineId"), value: z.number().nullable() }),
    z.object({ id: z.literal("clientName"), value: z.string().nullable() }),
    z.object({ id: z.literal("deliveryNoteId"), value: z.number().nullable() }),
    z.object({ id: z.literal("materialRawMaterialId"), value: z.number().nullable() }),
    z.object({ id: z.literal("partDescription"), value: z.string().nullable() }),
    z.object({ id: z.literal("partId"), value: z.number().nullable() }),
    z.object({ id: z.literal("partReference"), value: z.string().nullable() }),
    z.object({ id: z.literal("partShapeId"), value: z.number().nullable() }),
    z.object({ id: z.literal("partWidth"), value: decimalFilterSchema(1).nullable() }),
    z.object({ id: z.literal("quantity"), value: z.number().nullable() }),
    z.object({ id: z.literal("sellOrderId"), value: z.number().nullable() }),
    z.object({ id: z.literal("statuses"), value: z.array(productionOrderStatusSchema).nullable() }),
  ]),
);
export type TProductionOrderFilters = z.infer<typeof productionOrderFiltersSchema>;

export const tableProductionOrderStateSchema = tableStateSchema({
  filtersSchema: productionOrderFiltersSchema,
});
export type TTableProductionOrderState = z.infer<typeof tableProductionOrderStateSchema>;
