import {
  eq,
  sum,
  useLiveQuery,
  materialize,
  ilike,
  count,
  and,
  or,
  not,
  isNull,
  isUndefined,
  gt,
  gte,
  multiply,
  inArray,
  coalesce,
} from "@tanstack/react-db";
import type { InitialQueryBuilder, Ref } from "@tanstack/react-db";
import { useMemo } from "react";

import blueprintCollection from "@/collections/blueprint";
import clientCollection from "@/collections/client";
import coatingCollection from "@/collections/coating";
import deliveryNoteLineCollection from "@/collections/delivery-note-line";
import machineCollection from "@/collections/machine";
import machineProductionOrderQueueCollection from "@/collections/machine-production-order-queue";
import materialCollection from "@/collections/material";
import partCollection from "@/collections/part";
import partFeatureCollection from "@/collections/part-feature";
import partMaterialCollection from "@/collections/part-material";
import partProductionCollection from "@/collections/part-production";
import partReferenceCollection from "@/collections/part-reference";
import productionOrderCollection from "@/collections/production-order";
import qualityCheckCollection from "@/collections/quality-check";
import rawMaterialCollection from "@/collections/raw-material";
import sellOrderCollection from "@/collections/sell-order";
import sellOrderLineCollection from "@/collections/sell-order-line";
import shapeCollection from "@/collections/shape";
import treatmentReceptionCollection from "@/collections/treatment-reception";
import treatmentShipmentCollection from "@/collections/treatment-shipment";
import { computeProductionOrderStatus } from "@/lib/production-order";
import type { TProductionOrderStatusInput } from "@/lib/production-order";
import { getAccentInsensitiveLikePattern, includesIgnoringAccents } from "@/lib/utils";
import type { TSort } from "@/schemas";
import type { TProductionOrder, TProductionOrderFilters, TTableProductionOrderState } from "@/schemas/production-order";
import { ProductionOrderStatus } from "@/schemas/production-order";
import type { TSellOrder } from "@/schemas/sell-order";
import type { TSellOrderLine } from "@/schemas/sell-order-line";
import { getFilterValue } from "@/schemas/utils";
import { DEFAULT_PAGINATION } from "@/types";

export const DEFAULT_PRODUCTION_ORDER_SORTING: Array<TSort> = [{ id: "dimension", desc: false }];

export function useQueryProductionOrderProducedQuantity(productionOrderId?: number) {
  return useLiveQuery((q) => {
    if (productionOrderId === undefined) return undefined;
    return q
      .from({ partProduction: partProductionCollection })
      .where(({ partProduction }) => eq(partProduction.productionOrderId, productionOrderId))
      .select(({ partProduction }) => ({
        producedQuantity: sum(partProduction.quantity),
      }))
      .findOne();
  });
}

function treatmentQuantityFields(q: InitialQueryBuilder, productionOrder: Ref<TProductionOrder>) {
  return {
    sentQuantity: materialize(
      q
        .from({ rowShipment: treatmentShipmentCollection })
        .where(({ rowShipment }) => eq(rowShipment.productionOrderId, productionOrder.id))
        .select(({ rowShipment }) => ({ sentQuantity: sum(rowShipment.quantity) }))
        .findOne(),
    ),
    receivedQuantity: materialize(
      q
        .from({ rowReception: treatmentReceptionCollection })
        .innerJoin({ rowReceptionShipment: treatmentShipmentCollection }, ({ rowReception, rowReceptionShipment }) =>
          eq(rowReceptionShipment.id, rowReception.treatmentShipmentId),
        )
        .where(({ rowReceptionShipment }) => eq(rowReceptionShipment.productionOrderId, productionOrder.id))
        .select(({ rowReception }) => ({ receivedQuantity: sum(rowReception.quantity) }))
        .findOne(),
    ),
  };
}

export function useQueryProductionOrderStatusesBySellOrderLineIds(sellOrderLineIds: Array<number>) {
  const { data, ...rest } = useLiveQuery({
    query: (q) =>
      q
        .from({ productionOrder: productionOrderCollection })
        .where(({ productionOrder }) => inArray(productionOrder.sellOrderLineId, sellOrderLineIds))
        .select(({ productionOrder }) => ({
          ...productionOrder,
          ...treatmentQuantityFields(q, productionOrder),
          producedQuantity: materialize(
            q
              .from({ partProduction: partProductionCollection })
              .where(({ partProduction }) => eq(partProduction.productionOrderId, productionOrder.id))
              .select(({ partProduction }) => ({ producedQuantity: sum(partProduction.quantity) }))
              .findOne(),
          ),
          part: materialize(
            q
              .from({ part: partCollection })
              .where(({ part }) => eq(part.id, productionOrder.partId))
              .findOne(),
          ),
          assignedMachines: materialize(
            q
              .from({ machine: machineCollection })
              .where(({ machine }) => eq(machine.activeProductionOrderId, productionOrder.id)),
          ),
        })),
  });

  const productionOrderStatuses = useMemo(
    () =>
      data.map((productionOrder) => ({
        id: productionOrder.id,
        sellOrderLineId: productionOrder.sellOrderLineId,
        status: getProductionOrderStatus({
          ...productionOrder,
          producedQuantity: productionOrder.producedQuantity?.producedQuantity,
          // The Línea checks its own deletion, and the one of its Pedido, before its Órdenes de producción
          sellOrderLine: undefined,
        }),
      })),
    [data],
  );
  return { ...rest, data: productionOrderStatuses };
}

export function useQueryActiveProductionOrder({ productionOrderId }: { productionOrderId?: number | null }) {
  return useLiveQuery((q) => {
    if (productionOrderId == null) return undefined;
    return q
      .from({ productionOrder: productionOrderCollection })
      .where(({ productionOrder }) => eq(productionOrder.id, productionOrderId))
      .select(({ productionOrder }) => ({
        ...productionOrder,
        sellOrderLine: materialize(
          q
            .from({ sellOrderLine: sellOrderLineCollection })
            .where(({ sellOrderLine }) => eq(sellOrderLine.id, productionOrder.sellOrderLineId))
            .select(({ sellOrderLine }) => ({
              ...sellOrderLine,
              sellOrder: materialize(
                q
                  .from({ sellOrder: sellOrderCollection })
                  .where(({ sellOrder }) => eq(sellOrder.id, sellOrderLine.sellOrderId))
                  .select(({ sellOrder }) => ({
                    ...sellOrder,
                    client: materialize(
                      q
                        .from({ client: clientCollection })
                        .where(({ client }) => eq(client.id, sellOrder.clientId))
                        .findOne(),
                    ),
                  }))
                  .findOne(),
              ),
            }))
            .findOne(),
        ),
        part: materialize(
          q
            .from({ part: partCollection })
            .where(({ part }) => eq(part.id, productionOrder.partId))
            .select(({ part }) => ({
              ...part,
              coating: materialize(
                q
                  .from({ coating: coatingCollection })
                  .where(({ coating }) => eq(coating.id, part.coatingId))
                  .findOne(),
              ),
              materials: materialize(
                q
                  .from({ partMaterial: partMaterialCollection })
                  .innerJoin({ material: materialCollection }, ({ material, partMaterial }) =>
                    eq(partMaterial.materialId, material.id),
                  )
                  .where(({ partMaterial }) => eq(partMaterial.partId, part.id))
                  .select(({ material }) => ({
                    ...material,
                    rawMaterial: materialize(
                      q
                        .from({ rawMaterial: rawMaterialCollection })
                        .where(({ rawMaterial }) => eq(rawMaterial.id, material.rawMaterialId))
                        .findOne(),
                    ),
                    shape: materialize(
                      q
                        .from({ shape: shapeCollection })
                        .where(({ shape }) => eq(shape.id, material.shapeId))
                        .findOne(),
                    ),
                  })),
              ),
              shape: materialize(
                q
                  .from({ shape: shapeCollection })
                  .where(({ shape }) => eq(shape.id, part.shapeId))
                  .findOne(),
              ),
              blueprints: materialize(
                q.from({ blueprint: blueprintCollection }).where(({ blueprint }) => eq(blueprint.partId, part.id)),
              ),
              features: materialize(
                q
                  .from({ partFeature: partFeatureCollection })
                  .where(({ partFeature }) => eq(partFeature.partId, part.id))
                  .orderBy(({ partFeature }) => partFeature.id),
              ),
            }))
            .findOne(),
        ),
        qualityChecks: materialize(
          q
            .from({ qualityCheck: qualityCheckCollection })
            .where(({ qualityCheck }) => eq(qualityCheck.productionOrderId, productionOrder.id))
            .orderBy(({ qualityCheck }) => qualityCheck.checkedAt),
        ),
      }))
      .findOne();
  });
}
export type TActiveProductionOrder = NonNullable<ReturnType<typeof useQueryActiveProductionOrder>["data"]>;

export function useQueryProductionOrderForm({
  editProductionOrderId,
  skip = false,
}: {
  editProductionOrderId?: number;
  skip?: boolean;
}) {
  return useLiveQuery((q) => {
    if (editProductionOrderId === undefined || skip) {
      return undefined;
    }
    return q
      .from({ productionOrder: productionOrderCollection })
      .where(({ productionOrder }) => eq(productionOrder.id, editProductionOrderId))
      .select(({ productionOrder }) => ({
        ...productionOrder,
        sellOrderLine: materialize(
          q
            .from({ sellOrderLine: sellOrderLineCollection })
            .where(({ sellOrderLine }) => eq(sellOrderLine.id, productionOrder.sellOrderLineId))
            .select(({ sellOrderLine }) => ({
              ...sellOrderLine,
              sellOrder: materialize(
                q
                  .from({ sellOrder: sellOrderCollection })
                  .where(({ sellOrder }) => eq(sellOrder.id, sellOrderLine.sellOrderId))
                  .findOne(),
              ),
            }))
            .findOne(),
        ),
        partProductions: materialize(
          q
            .from({ partProduction: partProductionCollection })
            .where(({ partProduction }) => eq(partProduction.productionOrderId, productionOrder.id))
            .select(({ partProduction }) => ({
              ...partProduction,
              productionOrder: materialize(
                q
                  .from({ partProductionProductionOrder: productionOrderCollection })
                  .where(({ partProductionProductionOrder }) =>
                    eq(partProductionProductionOrder.id, partProduction.productionOrderId),
                  )
                  .select(({ partProductionProductionOrder }) => ({
                    ...partProductionProductionOrder,
                    part: materialize(
                      q
                        .from({ part: partCollection })
                        .where(({ part }) => eq(part.id, partProductionProductionOrder.partId))
                        .findOne(),
                    ),
                  }))
                  .findOne(),
              ),
            })),
        ),
        producedQuantity: materialize(
          q
            .from({ partProduction: partProductionCollection })
            .where(({ partProduction }) => eq(partProduction.productionOrderId, productionOrder.id))
            .select(({ partProduction }) => ({ producedQuantity: sum(partProduction.quantity) }))
            .findOne(),
        ),
        part: materialize(
          q
            .from({ part: partCollection })
            .where(({ part }) => eq(part.id, productionOrder.partId))
            .select(({ part }) => ({
              ...part,
              blueprints: materialize(
                q.from({ blueprint: blueprintCollection }).where(({ blueprint }) => eq(blueprint.partId, part.id)),
              ),
            }))
            .findOne(),
        ),
      }))
      .findOne();
  });
}

type TProductionOrderStatusRefs = {
  productionOrder: Ref<TProductionOrder>;
  sellOrderLine: Ref<TSellOrderLine> | undefined;
  sellOrder: Ref<TSellOrder> | undefined;
  producedQuantity: Ref<{ producedQuantity: number | undefined }>;
  assignedMachineCount: Ref<{ assignedMachineCount: number | undefined }> | undefined;
  part: Ref<{ coatingId: number | null }>;
  sentQuantity: Ref<{ sentQuantity: number | undefined }> | undefined;
  receivedQuantity: Ref<{ receivedQuantity: number | undefined }> | undefined;
};

const hasDeletedSellOrderLine = ({ sellOrderLine }: TProductionOrderStatusRefs) =>
  and(not(isUndefined(sellOrderLine)), not(isNull(sellOrderLine?.deletedAt)));

const hasDeletedSellOrder = ({ sellOrder }: TProductionOrderStatusRefs) =>
  and(not(isUndefined(sellOrder)), not(isNull(sellOrder?.deletedAt)));

const isDeletedProductionOrder = ({ productionOrder }: TProductionOrderStatusRefs) =>
  not(isNull(productionOrder.deletedAt));

const isSellOrderLineDeletedProductionOrder = (refs: TProductionOrderStatusRefs) =>
  and(not(isDeletedProductionOrder(refs)), hasDeletedSellOrderLine(refs));

const isSellOrderDeletedProductionOrder = (refs: TProductionOrderStatusRefs) =>
  and(not(isDeletedProductionOrder(refs)), not(hasDeletedSellOrderLine(refs)), hasDeletedSellOrder(refs));

const isAnyDeletedProductionOrder = (refs: TProductionOrderStatusRefs) =>
  or(isDeletedProductionOrder(refs), hasDeletedSellOrderLine(refs), hasDeletedSellOrder(refs));

const hasActiveMachine = ({ assignedMachineCount }: TProductionOrderStatusRefs) =>
  and(not(isUndefined(assignedMachineCount)), gt(assignedMachineCount?.assignedMachineCount, 0));

const isProducedProductionOrder = (refs: TProductionOrderStatusRefs) =>
  and(
    not(isAnyDeletedProductionOrder(refs)),
    not(isUndefined(refs.producedQuantity.producedQuantity)),
    or(
      and(
        not(isNull(refs.productionOrder.quantity)),
        gte(refs.producedQuantity.producedQuantity, refs.productionOrder.quantity),
      ),
      and(
        isNull(refs.productionOrder.quantity),
        gt(refs.producedQuantity.producedQuantity, 0),
        not(hasActiveMachine(refs)),
      ),
    ),
  );

const needsTreatment = ({ part }: TProductionOrderStatusRefs) => not(isNull(part.coatingId));

const hasPartsInTreatment = ({ sentQuantity, receivedQuantity }: TProductionOrderStatusRefs) =>
  gt(coalesce(sentQuantity?.sentQuantity, 0), coalesce(receivedQuantity?.receivedQuantity, 0));

const hasPartsPendingTreatment = ({ producedQuantity, sentQuantity }: TProductionOrderStatusRefs) =>
  gt(coalesce(producedQuantity.producedQuantity, 0), coalesce(sentQuantity?.sentQuantity, 0));

const isInTreatmentProductionOrder = (refs: TProductionOrderStatusRefs) =>
  and(isProducedProductionOrder(refs), needsTreatment(refs), hasPartsInTreatment(refs));

const isPendingTreatmentProductionOrder = (refs: TProductionOrderStatusRefs) =>
  and(
    isProducedProductionOrder(refs),
    needsTreatment(refs),
    not(hasPartsInTreatment(refs)),
    hasPartsPendingTreatment(refs),
  );

const isCompletedProductionOrder = (refs: TProductionOrderStatusRefs) =>
  and(
    isProducedProductionOrder(refs),
    not(isInTreatmentProductionOrder(refs)),
    not(isPendingTreatmentProductionOrder(refs)),
  );

const isInProductionProductionOrder = (refs: TProductionOrderStatusRefs) =>
  and(not(isAnyDeletedProductionOrder(refs)), not(isProducedProductionOrder(refs)), hasActiveMachine(refs));

const isPendingProductionOrder = (refs: TProductionOrderStatusRefs) =>
  and(
    not(isAnyDeletedProductionOrder(refs)),
    not(isProducedProductionOrder(refs)),
    not(isInProductionProductionOrder(refs)),
  );

const productionOrderStatusPredicates: Record<
  ProductionOrderStatus,
  (refs: TProductionOrderStatusRefs) => ReturnType<typeof or>
> = {
  [ProductionOrderStatus.Completed]: isCompletedProductionOrder,
  [ProductionOrderStatus.Deleted]: isDeletedProductionOrder,
  [ProductionOrderStatus.InProduction]: isInProductionProductionOrder,
  [ProductionOrderStatus.InTreatment]: isInTreatmentProductionOrder,
  [ProductionOrderStatus.Pending]: isPendingProductionOrder,
  [ProductionOrderStatus.PendingTreatment]: isPendingTreatmentProductionOrder,
  [ProductionOrderStatus.SellOrderDeleted]: isSellOrderDeletedProductionOrder,
  [ProductionOrderStatus.SellOrderLineDeleted]: isSellOrderLineDeletedProductionOrder,
};

function sentQuantities(q: InitialQueryBuilder) {
  return q
    .from({ sentShipment: treatmentShipmentCollection })
    .groupBy(({ sentShipment }) => sentShipment.productionOrderId)
    .select(({ sentShipment }) => ({
      productionOrderId: sentShipment.productionOrderId,
      sentQuantity: sum(sentShipment.quantity),
    }));
}

function receivedQuantities(q: InitialQueryBuilder) {
  return q
    .from({ receivedReception: treatmentReceptionCollection })
    .innerJoin({ receivedShipment: treatmentShipmentCollection }, ({ receivedReception, receivedShipment }) =>
      eq(receivedShipment.id, receivedReception.treatmentShipmentId),
    )
    .groupBy(({ receivedShipment }) => receivedShipment.productionOrderId)
    .select(({ receivedShipment, receivedReception }) => ({
      productionOrderId: receivedShipment.productionOrderId,
      receivedQuantity: sum(receivedReception.quantity),
    }));
}

function buildFilteredProductionOrders(q: InitialQueryBuilder, filters?: TProductionOrderFilters) {
  let query = q.from({ productionOrder: productionOrderCollection });

  if (getFilterValue(filters, "partId") != null) {
    query = query.where(({ productionOrder }) => eq(productionOrder.partId, getFilterValue(filters, "partId")));
  }
  if (getFilterValue(filters, "quantity") != null) {
    query = query.where(({ productionOrder }) => eq(productionOrder.quantity, getFilterValue(filters, "quantity")));
  }

  if (
    getFilterValue(filters, "sellOrderId") != null ||
    getFilterValue(filters, "clientName") != null ||
    getFilterValue(filters, "partReference") != null ||
    getFilterValue(filters, "deliveryNoteId") != null
  ) {
    let joinedQuery = query.innerJoin(
      { sellOrderLine: sellOrderLineCollection },
      ({ productionOrder, sellOrderLine }) => eq(productionOrder.sellOrderLineId, sellOrderLine.id),
    );

    if (getFilterValue(filters, "sellOrderId") != null) {
      joinedQuery = joinedQuery.where(({ sellOrderLine }) =>
        eq(sellOrderLine.sellOrderId, getFilterValue(filters, "sellOrderId")),
      );
    }
    const partReference = getFilterValue(filters, "partReference");
    if (partReference != null) {
      joinedQuery = joinedQuery
        .innerJoin({ partReference: partReferenceCollection }, ({ sellOrderLine, partReference }) =>
          eq(sellOrderLine.partReferenceId, partReference.id),
        )
        .where(({ partReference: filterPartReference }) =>
          ilike(filterPartReference.reference, getAccentInsensitiveLikePattern(partReference)),
        )
        .fn.where(({ partReference: filterPartReference }) =>
          includesIgnoringAccents(filterPartReference.reference, partReference),
        );
    }
    const clientName = getFilterValue(filters, "clientName");
    if (clientName != null) {
      joinedQuery = joinedQuery
        .innerJoin({ sellOrder: sellOrderCollection }, ({ sellOrderLine, sellOrder }) =>
          eq(sellOrderLine.sellOrderId, sellOrder.id),
        )
        .innerJoin({ client: clientCollection }, ({ sellOrder, client }) => eq(sellOrder.clientId, client.id))
        .fn.where(({ client }) => includesIgnoringAccents(client.name, clientName));
    }
    if (getFilterValue(filters, "deliveryNoteId") != null) {
      joinedQuery = joinedQuery
        .innerJoin({ deliveryNoteLine: deliveryNoteLineCollection }, ({ sellOrderLine, deliveryNoteLine }) =>
          eq(sellOrderLine.id, deliveryNoteLine.sellOrderLineId),
        )
        .where(({ deliveryNoteLine }) =>
          eq(deliveryNoteLine.deliveryNoteId, getFilterValue(filters, "deliveryNoteId")),
        );
    }
    query = joinedQuery;
  }

  const partDescription = getFilterValue(filters, "partDescription");
  const partShapeId = getFilterValue(filters, "partShapeId");
  const partWidth = getFilterValue(filters, "partWidth");
  if (partDescription != null || partShapeId != null || partWidth != null) {
    let partQuery = query.innerJoin({ filterPart: partCollection }, ({ productionOrder, filterPart }) =>
      eq(productionOrder.partId, filterPart.id),
    );
    if (partDescription != null) {
      partQuery = partQuery
        .where(({ filterPart }) => ilike(filterPart.description, getAccentInsensitiveLikePattern(partDescription)))
        .fn.where(({ filterPart }) => includesIgnoringAccents(filterPart.description, partDescription));
    }
    if (partShapeId != null) {
      partQuery = partQuery.where(({ filterPart }) => eq(filterPart.shapeId, partShapeId));
    }
    // The width is free text, so "10" and "10.0" are compared as numbers. Functional filters, because the on-demand
    // part collection would push them down to Electric, which can't compare a text column as a number
    const getNumericWidth = (width: string | null) => (width === null ? Number.NaN : Number(width));
    if (partWidth != null) {
      partQuery = partQuery.fn.where(({ filterPart }) => getNumericWidth(filterPart.width) === Number(partWidth));
    }
    query = partQuery;
  }

  // An Artículo has no Materia prima of its own, only the ones of its Materiales. Prefixed aliases, so the filter
  // does not leak into the subqueries of the projection
  const materialRawMaterialId = getFilterValue(filters, "materialRawMaterialId");
  if (materialRawMaterialId != null) {
    query = query
      .innerJoin({ filterPartMaterial: partMaterialCollection }, ({ productionOrder, filterPartMaterial }) =>
        eq(filterPartMaterial.partId, productionOrder.partId),
      )
      .innerJoin({ filterMaterial: materialCollection }, ({ filterPartMaterial, filterMaterial }) =>
        eq(filterMaterial.id, filterPartMaterial.materialId),
      )
      .where(({ filterMaterial }) => eq(filterMaterial.rawMaterialId, materialRawMaterialId));
  }

  if (getFilterValue(filters, "assignedMachineId") != null) {
    query = query
      .innerJoin(
        { assignedMachineQueue: machineProductionOrderQueueCollection },
        ({ productionOrder, assignedMachineQueue }) => eq(assignedMachineQueue.productionOrderId, productionOrder.id),
      )
      .where(({ assignedMachineQueue }) =>
        eq(assignedMachineQueue.machineId, getFilterValue(filters, "assignedMachineId")),
      );
  }

  const producedQuantities = q
    .from({ partProduction: partProductionCollection })
    .groupBy(({ partProduction }) => partProduction.productionOrderId)
    .select(({ partProduction }) => ({
      producedQuantity: sum(partProduction.quantity),
      productionOrderId: partProduction.productionOrderId,
    }));
  let joinedQuery = query.join({ producedQuantity: producedQuantities }, ({ producedQuantity, productionOrder }) =>
    eq(productionOrder.id, producedQuantity.productionOrderId),
  );

  const statuses = getFilterValue(filters, "statuses");
  if (statuses && statuses.length > 0) {
    // The alias must not collide with the `machine` alias used by the `assignedMachines` subquery
    // below, otherwise this filter leaks into it and hides the assigned machines of the rows
    const assignedMachineCounts = q
      .from({ statusMachine: machineCollection })
      .where(({ statusMachine }) => not(isNull(statusMachine.activeProductionOrderId)))
      .groupBy(({ statusMachine }) => statusMachine.activeProductionOrderId)
      .select(({ statusMachine }) => ({
        activeProductionOrderId: statusMachine.activeProductionOrderId,
        assignedMachineCount: count(statusMachine.id),
      }));

    joinedQuery = joinedQuery
      .leftJoin({ statusSellOrderLine: sellOrderLineCollection }, ({ productionOrder, statusSellOrderLine }) =>
        eq(productionOrder.sellOrderLineId, statusSellOrderLine.id),
      )
      .leftJoin({ statusSellOrder: sellOrderCollection }, ({ statusSellOrderLine, statusSellOrder }) =>
        eq(statusSellOrderLine.sellOrderId, statusSellOrder.id),
      )
      .leftJoin({ assignedMachineCount: assignedMachineCounts }, ({ productionOrder, assignedMachineCount }) =>
        eq(productionOrder.id, assignedMachineCount.activeProductionOrderId),
      )
      .innerJoin({ statusPart: partCollection }, ({ productionOrder, statusPart }) =>
        eq(productionOrder.partId, statusPart.id),
      )
      .leftJoin({ statusSentQuantity: sentQuantities(q) }, ({ productionOrder, statusSentQuantity }) =>
        eq(productionOrder.id, statusSentQuantity.productionOrderId),
      )
      .leftJoin({ statusReceivedQuantity: receivedQuantities(q) }, ({ productionOrder, statusReceivedQuantity }) =>
        eq(productionOrder.id, statusReceivedQuantity.productionOrderId),
      )
      .where(
        ({
          productionOrder,
          statusSellOrderLine,
          statusSellOrder,
          producedQuantity,
          assignedMachineCount,
          statusPart,
          statusSentQuantity,
          statusReceivedQuantity,
        }) =>
          statuses
            .map((status) =>
              productionOrderStatusPredicates[status]({
                assignedMachineCount,
                part: statusPart,
                producedQuantity,
                productionOrder,
                receivedQuantity: statusReceivedQuantity,
                sellOrder: statusSellOrder,
                sellOrderLine: statusSellOrderLine,
                sentQuantity: statusSentQuantity,
              }),
            )
            .reduce((combined, predicate) => or(combined, predicate)),
      );
  }

  return joinedQuery;
}

export function useQueryProductionOrderTable({
  filters,
  pagination = DEFAULT_PAGINATION,
  sorts = DEFAULT_PRODUCTION_ORDER_SORTING,
}: TTableProductionOrderState = {}) {
  // The functional width filters make the query unhashable, so its identity can only come from a queryKey
  const { data: countData, isReady: isCountReady } = useLiveQuery({
    queryKey: ["productionOrderTableCount", filters],
    query: (q) => {
      const filtered = buildFilteredProductionOrders(q, filters)
        .select(({ productionOrder }) => ({ id: productionOrder.id }))
        .distinct();
      return q.from({ order: filtered }).select(({ order }) => ({ count: count(order.id) }));
    },
  });

  const limit = pagination?.pageSize ?? 10;
  const offset = (pagination?.pageIndex ?? 0) * limit;
  const { data, ...rest } = useLiveQuery({
    queryKey: ["productionOrderTable", filters, sorts, pagination],
    query: (q) => {
      let query = buildFilteredProductionOrders(q, filters)
        .innerJoin({ sortPart: partCollection }, ({ productionOrder, sortPart }) =>
          eq(productionOrder.partId, sortPart.id),
        )
        .leftJoin({ sortSellOrderLine: sellOrderLineCollection }, ({ productionOrder, sortSellOrderLine }) =>
          eq(productionOrder.sellOrderLineId, sortSellOrderLine.id),
        );

      for (const sort of sorts) {
        if (sort.id === "dimension") {
          query = query
            .orderBy(({ sortPart }) => multiply(sortPart.width, 1), sort.desc ? "desc" : "asc")
            .orderBy(({ sortPart }) => sortPart.shapeId, "desc");
          continue;
        }
        if (sort.id === "requestedDeliveryDate") {
          query = query.orderBy(({ sortSellOrderLine }) => sortSellOrderLine.requestedDeliveryDate, {
            direction: sort.desc ? "desc" : "asc",
            nulls: "last",
          });
          continue;
        }
        query = query.orderBy(
          ({ productionOrder }) => productionOrder[sort.id as keyof typeof productionOrder],
          sort.desc ? "desc" : "asc",
        );
      }

      if (pagination !== null) {
        query = query.limit(limit).offset(offset);
      }

      const projected = query.select(({ productionOrder, producedQuantity }) => ({
        ...productionOrder,
        producedQuantity: producedQuantity.producedQuantity,
        ...treatmentQuantityFields(q, productionOrder),
        sellOrderLine: materialize(
          q
            .from({ sellOrderLine: sellOrderLineCollection })
            .where(({ sellOrderLine }) => eq(sellOrderLine.id, productionOrder.sellOrderLineId))
            .select(({ sellOrderLine }) => ({
              ...sellOrderLine,
              sellOrder: materialize(
                q
                  .from({ sellOrder: sellOrderCollection })
                  .where(({ sellOrder }) => eq(sellOrder.id, sellOrderLine.sellOrderId))
                  .select(({ sellOrder }) => ({
                    ...sellOrder,
                    client: materialize(
                      q
                        .from({ client: clientCollection })
                        .where(({ client }) => eq(client.id, sellOrder.clientId))
                        .findOne(),
                    ),
                  }))
                  .findOne(),
              ),
              partReference: materialize(
                q
                  .from({ partReference: partReferenceCollection })
                  .where(({ partReference }) => eq(partReference.id, sellOrderLine.partReferenceId))
                  .findOne(),
              ),
            }))
            .findOne(),
        ),
        assignedMachines: materialize(
          q
            .from({ machineProductionOrderQueue: machineProductionOrderQueueCollection })
            .where(({ machineProductionOrderQueue }) =>
              eq(machineProductionOrderQueue.productionOrderId, productionOrder.id),
            )
            .innerJoin({ machine: machineCollection }, ({ machineProductionOrderQueue, machine }) =>
              eq(machine.id, machineProductionOrderQueue.machineId),
            )
            .select(({ machine }) => ({ ...machine })),
        ),
        producedMachines: materialize(
          q
            .from({ partProduction: partProductionCollection })
            .where(({ partProduction }) => eq(partProduction.productionOrderId, productionOrder.id))
            .innerJoin({ machine: machineCollection }, ({ partProduction, machine }) =>
              eq(machine.id, partProduction.machineId),
            )
            .select(({ machine }) => ({ ...machine })),
        ),
        part: materialize(
          q
            .from({ part: partCollection })
            .where(({ part }) => eq(part.id, productionOrder.partId))
            .select(({ part }) => ({
              ...part,
              shape: materialize(
                q
                  .from({ shape: shapeCollection })
                  .where(({ shape }) => eq(shape.id, part.shapeId))
                  .findOne(),
              ),
              blueprints: materialize(
                q.from({ blueprint: blueprintCollection }).where(({ blueprint }) => eq(blueprint.partId, part.id)),
              ),
              references: materialize(
                q
                  .from({ partReference: partReferenceCollection })
                  .where(({ partReference }) => eq(partReference.partId, part.id))
                  .select(({ partReference }) => ({
                    ...partReference,
                    client: materialize(
                      q
                        .from({ client: clientCollection })
                        .where(({ client }) => eq(client.id, partReference.clientId))
                        .findOne(),
                    ),
                  })),
              ),
            }))
            .findOne(),
        ),
        partProductions: materialize(
          q
            .from({ partProduction: partProductionCollection })
            .where(({ partProduction }) => eq(partProduction.productionOrderId, productionOrder.id))
            .select(({ partProduction }) => ({
              ...partProduction,
              machine: materialize(
                q
                  .from({ machine: machineCollection })
                  .where(({ machine }) => eq(machine.id, partProduction.machineId))
                  .findOne(),
              ),
              productionOrder: materialize(
                q
                  .from({ partProductionProductionOrder: productionOrderCollection })
                  .where(({ partProductionProductionOrder }) =>
                    eq(partProductionProductionOrder.id, partProduction.productionOrderId),
                  )
                  .select(({ partProductionProductionOrder }) => ({
                    id: partProductionProductionOrder.id,
                    part: materialize(
                      q
                        .from({ part: partCollection })
                        .where(({ part }) => eq(part.id, partProductionProductionOrder.partId))
                        .select(({ part }) => ({
                          id: part.id,
                          description: part.description,
                        })),
                    ),
                  }))
                  .findOne(),
              ),
            })),
        ),
      }));

      // The Line join of the Albarán filter and the Material join of the Artículo can fan a Production Order out
      // into several rows, like an Artículo with two Materiales of the filtered Materia prima
      return getFilterValue(filters, "deliveryNoteId") != null ||
        getFilterValue(filters, "materialRawMaterialId") != null
        ? projected.distinct()
        : projected;
    },
  });

  return { ...rest, data, rowCount: isCountReady ? (countData[0]?.count ?? 0) : null };
}

export type TProductionOrderTableRow = NonNullable<ReturnType<typeof useQueryProductionOrderTable>["data"][number]>;

export function getProductionOrderStatus(productionOrder: {
  id: number;
  deletedAt: Date | null;
  quantity: number | null;
  sellOrderLine: TProductionOrderStatusInput["sellOrderLine"];
  producedQuantity: number | undefined;
  assignedMachines: Array<{ activeProductionOrderId: number | null }>;
  part: { coatingId: number | null } | undefined;
  sentQuantity: { sentQuantity: number | undefined } | undefined;
  receivedQuantity: { receivedQuantity: number | undefined } | undefined;
}): ProductionOrderStatus {
  return computeProductionOrderStatus({
    ...productionOrder,
    isActiveOnMachine: productionOrder.assignedMachines.some(
      (machine) => machine.activeProductionOrderId === productionOrder.id,
    ),
    needsTreatment: productionOrder.part?.coatingId != null,
    producedQuantity: productionOrder.producedQuantity ?? 0,
    receivedQuantity: productionOrder.receivedQuantity?.receivedQuantity ?? 0,
    sentQuantity: productionOrder.sentQuantity?.sentQuantity ?? 0,
  });
}
