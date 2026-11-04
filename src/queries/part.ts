import type { InitialQueryBuilder } from "@tanstack/react-db";
import { and, eq, useLiveQuery, materialize, ilike, not, or, isNull, isUndefined, count } from "@tanstack/react-db";
import { useMemo } from "react";

import blueprintCollection from "@/collections/blueprint";
import clientCollection from "@/collections/client";
import coatingCollection from "@/collections/coating";
import deliveryNoteCollection from "@/collections/delivery-note";
import deliveryNoteLineCollection from "@/collections/delivery-note-line";
import materialCollection from "@/collections/material";
import partCollection from "@/collections/part";
import partFeatureCollection from "@/collections/part-feature";
import partMaterialCollection from "@/collections/part-material";
import partPriceCollection from "@/collections/part-price";
import partProductionCollection from "@/collections/part-production";
import partReferenceCollection from "@/collections/part-reference";
import partStockCollection from "@/collections/part-stock";
import productionOrderCollection from "@/collections/production-order";
import rawMaterialCollection from "@/collections/raw-material";
import sellOrderCollection from "@/collections/sell-order";
import sellOrderLineCollection from "@/collections/sell-order-line";
import shapeCollection from "@/collections/shape";
import { getAccentInsensitiveLikePattern, includesIgnoringAccents } from "@/lib/utils";
import { buildStockLedger } from "@/queries/part-stock";
import type { TSort } from "@/schemas";
import type { TPartFilters, TTablePartState } from "@/schemas/part";
import { getFilterValue } from "@/schemas/utils";
import { DEFAULT_PAGINATION, type TBaseQueryProps } from "@/types";

export const DEFAULT_PART_SORTING: Array<TSort> = [{ id: "id", desc: false }];

function buildFilteredParts(q: InitialQueryBuilder, filters?: TPartFilters) {
  let query = q.from({ part: partCollection });
  if (getFilterValue(filters, "reference") != null || getFilterValue(filters, "clientId") != null) {
    let queryWithPartReference = query
      .leftJoin({ partReference: partReferenceCollection }, ({ partReference, part }) =>
        eq(partReference.partId, part.id),
      )
      .leftJoin({ partReferenceClient: clientCollection }, ({ partReference, partReferenceClient }) =>
        eq(partReferenceClient.id, partReference.clientId),
      )
      .where(({ partReference, partReferenceClient }) =>
        and(
          isNull(partReference.deletedAt),
          or(isUndefined(partReferenceClient), isNull(partReferenceClient.deletedAt)),
        ),
      );

    const reference = getFilterValue(filters, "reference");
    if (reference != null) {
      queryWithPartReference = queryWithPartReference
        .where(({ partReference }) => ilike(partReference.reference, getAccentInsensitiveLikePattern(reference)))
        .fn.where(({ partReference }) => includesIgnoringAccents(partReference?.reference ?? null, reference));
    }
    if (
      getFilterValue(filters, "clientId") != null &&
      getFilterValue(filters, "includePartReferenceNullClientId") == true
    ) {
      queryWithPartReference = queryWithPartReference.where(({ partReference }) =>
        or(eq(partReference.clientId, getFilterValue(filters, "clientId")), isNull(partReference.clientId)),
      );
    } else if (getFilterValue(filters, "clientId") != null) {
      queryWithPartReference = queryWithPartReference.where(({ partReference }) =>
        eq(partReference.clientId, getFilterValue(filters, "clientId")),
      );
    }

    query = queryWithPartReference;
  }
  const description = getFilterValue(filters, "description");
  if (description != null) {
    query = query
      .where(({ part }) => ilike(part.description, getAccentInsensitiveLikePattern(description)))
      .fn.where(({ part }) => includesIgnoringAccents(part.description, description));
  }
  if (partsRequireMaterialJoin(filters)) {
    const materialId = getFilterValue(filters, "materialId");
    const materialWidth = getFilterValue(filters, "materialWidth");
    const materialRawMaterialId = getFilterValue(filters, "materialRawMaterialId");
    const materialShapeId = getFilterValue(filters, "materialShapeId");

    let queryWithMaterial = query
      .innerJoin({ partMaterial: partMaterialCollection }, ({ partMaterial, part }) => eq(partMaterial.partId, part.id))
      .innerJoin({ material: materialCollection }, ({ partMaterial, material }) =>
        eq(material.id, partMaterial.materialId),
      );

    if (materialId != null) {
      queryWithMaterial = queryWithMaterial.where(({ partMaterial }) => eq(partMaterial.materialId, materialId));
    }
    if (materialWidth != null && materialWidth !== "") {
      // The numeric width is synced as text keeping the scale it was inserted with, so 10 may be "10" or "10.0"
      const width = Number(materialWidth);
      queryWithMaterial = queryWithMaterial.where(({ material }) =>
        or(eq(material.width, String(width)), eq(material.width, width.toFixed(1))),
      );
    }
    if (materialRawMaterialId != null) {
      queryWithMaterial = queryWithMaterial.where(({ material }) => eq(material.rawMaterialId, materialRawMaterialId));
    }
    if (materialShapeId != null) {
      queryWithMaterial = queryWithMaterial.where(({ material }) => eq(material.shapeId, materialShapeId));
    }

    query = queryWithMaterial;
  }
  if (getFilterValue(filters, "coatingId") != null) {
    query = query.where(({ part }) => eq(part.coatingId, getFilterValue(filters, "coatingId")));
  }
  if (getFilterValue(filters, "hasCoating") === true) {
    query = query.where(({ part }) => not(isNull(part.coatingId)));
  }
  if (getFilterValue(filters, "deletedAt") !== true) {
    query = query.where(({ part }) => isNull(part.deletedAt));
  }

  return query;
}

// Only the reference/client/material filters add a join in buildFilteredParts; those joins
// can fan a single part out into several rows.
function partsRequireJoin(filters?: TPartFilters) {
  return (
    getFilterValue(filters, "reference") != null ||
    getFilterValue(filters, "clientId") != null ||
    partsRequireMaterialJoin(filters)
  );
}

function partsRequireMaterialJoin(filters?: TPartFilters) {
  return (
    getFilterValue(filters, "materialId") != null ||
    getFilterValue(filters, "materialWidth") != null ||
    getFilterValue(filters, "materialRawMaterialId") != null ||
    getFilterValue(filters, "materialShapeId") != null
  );
}

function partSelectProjection({
  query: q,
  filters,
  pagination,
  sorts,
}: { query: InitialQueryBuilder } & TBaseQueryProps<TPartFilters>) {
  let query = buildFilteredParts(q, filters);

  for (const sort of sorts ?? DEFAULT_PART_SORTING) {
    query = query.orderBy(({ part }) => part[sort.id as keyof typeof part], sort.desc ? "desc" : "asc");
  }

  if (pagination != null) {
    query = query.limit(pagination.pageSize ?? 10).offset((pagination.pageIndex ?? 0) * (pagination.pageSize ?? 10));
  }

  const projected = query.select(({ part }) => ({
    ...part,
    coating: materialize(
      q
        .from({ coating: coatingCollection })
        .where(({ coating }) => eq(coating.id, part.coatingId))
        .findOne(),
    ),
    blueprints: materialize(
      q.from({ blueprint: blueprintCollection }).where(({ blueprint }) => eq(blueprint.partId, part.id)),
    ),
    features: materialize(
      q.from({ partFeature: partFeatureCollection }).where(({ partFeature }) => eq(partFeature.partId, part.id)),
    ),
    // The References and Prices of a deleted Cliente are hidden, but kept for the history that points to them.
    // Deleted References are kept so the form can restore them, the table drops them
    references: materialize(
      q
        .from({ partReference: partReferenceCollection })
        .leftJoin({ referenceClient: clientCollection }, ({ partReference, referenceClient }) =>
          eq(referenceClient.id, partReference.clientId),
        )
        .where(({ partReference, referenceClient }) =>
          and(eq(partReference.partId, part.id), or(isUndefined(referenceClient), isNull(referenceClient.deletedAt))),
        )
        .select(({ partReference, referenceClient }) => ({ ...partReference, client: referenceClient })),
    ),
    prices: materialize(
      q
        .from({ partPrice: partPriceCollection })
        .leftJoin({ priceClient: clientCollection }, ({ partPrice, priceClient }) =>
          eq(priceClient.id, partPrice.clientId),
        )
        .where(({ partPrice, priceClient }) =>
          and(eq(partPrice.partId, part.id), or(isUndefined(priceClient), isNull(priceClient.deletedAt))),
        )
        .select(({ partPrice, priceClient }) => ({ ...partPrice, client: priceClient }))
        .orderBy(({ partPrice }) => partPrice.createdAt, "desc"),
    ),
    materials: materialize(
      q
        .from({ partMaterial: partMaterialCollection })
        .where(({ partMaterial }) => eq(partMaterial.partId, part.id))
        .innerJoin({ material: materialCollection }, ({ partMaterial, material }) =>
          eq(material.id, partMaterial.materialId),
        )
        .innerJoin({ rawMaterial: rawMaterialCollection }, ({ material, rawMaterial }) =>
          eq(rawMaterial.id, material.rawMaterialId),
        )
        .innerJoin({ shape: shapeCollection }, ({ material, shape }) => eq(shape.id, material.shapeId))
        .select(({ material, rawMaterial, shape }) => ({
          ...material,
          rawMaterial,
          shape,
        })),
    ),
    // Raw transaction streams for the stock ledger — merged and reduced to a running balance
    // in JS (see buildStockLedger) after the query, since the balance is imperative.
    // Nested via the table that holds `partId`: an include only narrows to the page's parts
    // early when it correlates on a column of its own root table, and its rows are keyed by
    // that root, so each leaf include must stay rooted on the transaction table itself.
    stockProductionOrders: materialize(
      q
        .from({ productionOrder: productionOrderCollection })
        .where(({ productionOrder }) => eq(productionOrder.partId, part.id))
        .select(({ productionOrder: outerProductionOrder }) => ({
          productions: materialize(
            q
              .from({ partProduction: partProductionCollection })
              .where(({ partProduction }) => eq(partProduction.productionOrderId, outerProductionOrder.id))
              .innerJoin({ productionOrder: productionOrderCollection }, ({ partProduction, productionOrder }) =>
                eq(partProduction.productionOrderId, productionOrder.id),
              )
              .select(({ partProduction, productionOrder }) => ({
                ...partProduction,
                productionOrder,
                __typename: "PartProduction" as const,
              })),
          ),
        })),
    ),
    stockPartReferences: materialize(
      q
        .from({ partReference: partReferenceCollection })
        .where(({ partReference }) => eq(partReference.partId, part.id))
        .select(({ partReference }) => ({
          deliveryNoteLines: materialize(
            q
              .from({ deliveryNoteLine: deliveryNoteLineCollection })
              .where(({ deliveryNoteLine }) => eq(deliveryNoteLine.partReferenceId, partReference.id))
              .innerJoin({ deliveryNote: deliveryNoteCollection }, ({ deliveryNoteLine, deliveryNote }) =>
                eq(deliveryNoteLine.deliveryNoteId, deliveryNote.id),
              )
              .select(({ deliveryNoteLine, deliveryNote }) => ({
                ...deliveryNoteLine,
                date: deliveryNote.createdAt,
                deliveryNote,
                sellOrderLine: materialize(
                  q
                    .from({ sellOrderLine: sellOrderLineCollection })
                    .where(({ sellOrderLine }) => eq(sellOrderLine.id, deliveryNoteLine.sellOrderLineId))
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
                __typename: "DeliveryNoteLine" as const,
              })),
          ),
        })),
    ),
    stockEntries: materialize(
      q
        .from({ partStock: partStockCollection })
        .where(({ partStock }) => eq(partStock.partId, part.id))
        .select(({ partStock }) => ({ ...partStock, __typename: "PartStock" as const })),
    ),
  }));

  return partsRequireJoin(filters) ? projected.distinct() : projected;
}

export function useQueryPartForm({ partId, skip = false }: { partId?: number; skip?: boolean }) {
  const result = useLiveQuery((query) => {
    if (skip || partId === undefined) return undefined;
    return partSelectProjection({ query, filters: [{ id: "deletedAt", value: true }] })
      .where(({ part }) => eq(part.id, partId))
      .findOne();
  });

  // Replace the raw transaction streams with the computed running-balance ledger.
  const data = useMemo(() => {
    if (!result.data) return result.data;
    const { stockProductionOrders, stockPartReferences, stockEntries, ...part } = result.data;
    return {
      ...part,
      stockTransactions: buildStockLedger(
        stockProductionOrders.flatMap((productionOrder) => productionOrder.productions),
        stockPartReferences.flatMap((partReference) => partReference.deliveryNoteLines),
        stockEntries,
      ),
    };
  }, [result]);

  return { ...result, data };
}

// Part shape shared by the form and the table, carrying the computed `stockTransactions` ledger.
export type TPartForm = TPartTableRow;
export type TClientBlueprint = TPartForm["blueprints"][number];
export type TPartPriceForm = TPartForm["prices"][number];
export type TPartFormPartReference = TPartForm["references"][number];
export type TPartFormBlueprint = TPartForm["blueprints"][number];
export type TPartFormPartFeature = TPartForm["features"][number];

// Shared with the loaders that preload the table on the server, which only match queries built the same way
export function partTableQueries({
  filters,
  pagination = DEFAULT_PAGINATION,
  sorts = DEFAULT_PART_SORTING,
}: TTablePartState = {}) {
  return {
    count: {
      queryKey: ["partTableCount", filters],
      query: (q: InitialQueryBuilder) => {
        const filtered = buildFilteredParts(q, filters)
          .select(({ part }) => ({ id: part.id }))
          .distinct();
        return q.from({ filteredPart: filtered }).select(({ filteredPart }) => ({ count: count(filteredPart.id) }));
      },
    },
    parts: {
      queryKey: ["partTable", filters, pagination, sorts],
      query: (query: InitialQueryBuilder) => partSelectProjection({ query, filters, pagination, sorts }),
    },
  };
}

export function useQueryPartTable(state: TTablePartState = {}) {
  const queries = partTableQueries(state);
  const { data: countData, isReady: isCountReady } = useLiveQuery(queries.count);
  const { data: partsData, ...rest } = useLiveQuery(queries.parts);

  // Replace each row's raw transaction streams with the computed running-balance ledger.
  const data = useMemo(
    () =>
      partsData.map(({ stockProductionOrders, stockPartReferences, stockEntries, ...part }) => ({
        ...part,
        references: part.references.filter((partReference) => partReference.deletedAt === null),
        stockTransactions: buildStockLedger(
          stockProductionOrders.flatMap((productionOrder) => productionOrder.productions),
          stockPartReferences.flatMap((partReference) => partReference.deliveryNoteLines),
          stockEntries,
        ),
      })),
    [partsData],
  );

  return { ...rest, data, rowCount: isCountReady ? (countData[0]?.count ?? 0) : null };
}

type TPartTableRow = NonNullable<ReturnType<typeof useQueryPartTable>["data"][number]>;
export type TPartStockRecord = TPartTableRow["stockTransactions"][number];
export type TPartStockTransaction = TPartStockRecord["transaction"];

export function useQueryPartBlueprints(partId?: number | null) {
  return useLiveQuery((q) =>
    partId == null
      ? undefined
      : q
          .from({ blueprint: blueprintCollection })
          .where(({ blueprint }) => eq(blueprint.partId, partId))
          .orderBy(({ blueprint }) => blueprint.id),
  );
}
