import { and, eq, gte, isNull, lte, materialize, not, sum, useLiveQuery } from "@tanstack/react-db";
import type { InitialQueryBuilder, Ref } from "@tanstack/react-db";
import { useMemo } from "react";

import blueprintCollection from "@/collections/blueprint";
import clientCollection from "@/collections/client";
import coatingCollection from "@/collections/coating";
import partCollection from "@/collections/part";
import partProductionCollection from "@/collections/part-production";
import partReferenceCollection from "@/collections/part-reference";
import productionOrderCollection from "@/collections/production-order";
import sellOrderCollection from "@/collections/sell-order";
import sellOrderLineCollection from "@/collections/sell-order-line";
import treatmentReceptionCollection from "@/collections/treatment-reception";
import treatmentShipmentCollection from "@/collections/treatment-shipment";
import { endOfAppDay, startOfAppDay } from "@/lib/dates";
import type { TProductionOrder } from "@/schemas/production-order";

function treatmentPart(q: InitialQueryBuilder, owner: Ref<{ partId: number }>) {
  return materialize(
    q
      .from({ part: partCollection })
      .where(({ part }) => eq(part.id, owner.partId))
      .select(({ part }) => ({
        id: part.id,
        description: part.description,
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
        coating: materialize(
          q
            .from({ coating: coatingCollection })
            .where(({ coating }) => eq(coating.id, part.coatingId))
            .findOne(),
        ),
      }))
      .findOne(),
  );
}

function productionOrderSellOrderLine(q: InitialQueryBuilder, productionOrder: Ref<TProductionOrder>) {
  return {
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
  };
}

export function useQueryTreatmentPendingProductionOrders() {
  const { data, ...rest } = useLiveQuery((q) =>
    q
      .from({ productionOrder: productionOrderCollection })
      .innerJoin({ pendingPart: partCollection }, ({ productionOrder, pendingPart }) =>
        eq(productionOrder.partId, pendingPart.id),
      )
      .where(({ productionOrder }) => isNull(productionOrder.deletedAt))
      .where(({ pendingPart }) => not(isNull(pendingPart.coatingId)))
      .orderBy(({ productionOrder }) => productionOrder.id)
      .select(({ productionOrder }) => ({
        ...productionOrder,
        part: treatmentPart(q, productionOrder),
        ...productionOrderSellOrderLine(q, productionOrder),
        producedQuantity: materialize(
          q
            .from({ partProduction: partProductionCollection })
            .where(({ partProduction }) => eq(partProduction.productionOrderId, productionOrder.id))
            .select(({ partProduction }) => ({ producedQuantity: sum(partProduction.quantity) }))
            .findOne(),
        ),
        sentQuantity: materialize(
          q
            .from({ treatmentShipment: treatmentShipmentCollection })
            .where(({ treatmentShipment }) => eq(treatmentShipment.productionOrderId, productionOrder.id))
            .select(({ treatmentShipment }) => ({ sentQuantity: sum(treatmentShipment.quantity) }))
            .findOne(),
        ),
      })),
  );

  const pendingProductionOrders = useMemo(
    () =>
      data
        .filter(
          (productionOrder) =>
            productionOrder.sellOrderLine?.deletedAt == null &&
            productionOrder.sellOrderLine?.sellOrder?.deletedAt == null,
        )
        .map((productionOrder) => {
          const producedQuantity = productionOrder.producedQuantity?.producedQuantity ?? 0;
          const sentQuantity = productionOrder.sentQuantity?.sentQuantity ?? 0;
          return {
            ...productionOrder,
            producedQuantity,
            sentQuantity,
            unsentQuantity: producedQuantity - sentQuantity,
          };
        })
        .filter((productionOrder) => productionOrder.unsentQuantity > 0),
    [data],
  );
  return { ...rest, data: pendingProductionOrders };
}
export type TTreatmentPendingProductionOrder = ReturnType<
  typeof useQueryTreatmentPendingProductionOrders
>["data"][number];

interface TTreatmentBatchesQueryProps {
  partId?: number | null;
  date?: Date | null;
  enabled?: boolean;
}

export function useQueryTreatmentBatches({
  partId = null,
  date = null,
  enabled = true,
}: TTreatmentBatchesQueryProps = {}) {
  // shortcut: without filters it loads every shipment ever sent to find the pending ones, store a received flag once it grows too large
  const { data, ...rest } = useLiveQuery({
    queryKey: ["treatment-batches", partId, date?.getTime(), enabled],
    query: (q) => {
      if (!enabled) return undefined;
      let query = q.from({ treatmentShipment: treatmentShipmentCollection });
      if (partId != null) {
        query = query.where(({ treatmentShipment }) => eq(treatmentShipment.partId, partId));
      }
      if (date != null) {
        query = query.where(({ treatmentShipment }) =>
          and(gte(treatmentShipment.sentAt, startOfAppDay(date)), lte(treatmentShipment.sentAt, endOfAppDay(date))),
        );
      }
      return query
        .orderBy(({ treatmentShipment }) => treatmentShipment.id)
        .select(({ treatmentShipment }) => ({
          ...treatmentShipment,
          part: treatmentPart(q, treatmentShipment),
          productionOrder: materialize(
            q
              .from({ shipmentProductionOrder: productionOrderCollection })
              .where(({ shipmentProductionOrder }) =>
                eq(shipmentProductionOrder.id, treatmentShipment.productionOrderId),
              )
              .select(({ shipmentProductionOrder }) => ({
                ...shipmentProductionOrder,
                ...productionOrderSellOrderLine(q, shipmentProductionOrder),
              }))
              .findOne(),
          ),
          treatmentReceptions: materialize(
            q
              .from({ treatmentReception: treatmentReceptionCollection })
              .where(({ treatmentReception }) => eq(treatmentReception.treatmentShipmentId, treatmentShipment.id))
              .orderBy(({ treatmentReception }) => treatmentReception.id),
          ),
        }));
    },
  });

  const batches = useMemo(() => {
    const shipmentsBySentAt = new Map<
      number,
      Array<NonNullable<typeof data>[number] & { receivedQuantity: number; pendingQuantity: number }>
    >();
    for (const treatmentShipment of data ?? []) {
      const receivedQuantity = treatmentShipment.treatmentReceptions.reduce(
        (total, treatmentReception) => total + treatmentReception.quantity,
        0,
      );
      const sentAt = treatmentShipment.sentAt.getTime();
      shipmentsBySentAt.set(sentAt, [
        ...(shipmentsBySentAt.get(sentAt) ?? []),
        { ...treatmentShipment, receivedQuantity, pendingQuantity: treatmentShipment.quantity - receivedQuantity },
      ]);
    }
    return [...shipmentsBySentAt.entries()]
      .map(([sentAt, treatmentShipments]) => ({
        sentAt: new Date(sentAt),
        treatmentShipments,
        isReceived: treatmentShipments.every((treatmentShipment) => treatmentShipment.pendingQuantity === 0),
      }))
      .sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());
  }, [data]);
  return { ...rest, data: batches };
}
export type TTreatmentBatch = ReturnType<typeof useQueryTreatmentBatches>["data"][number];
export type TTreatmentBatchShipment = TTreatmentBatch["treatmentShipments"][number];
