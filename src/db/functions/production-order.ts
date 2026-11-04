import { and, asc, desc, eq, exists, getColumns, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

import type { TDatabase } from "@/db";
import db, { searchInStringColumnIgnoreDiacritics } from "@/db";
import { isSortableColumn } from "@/db/functions";
import { getMachines } from "@/db/functions/machine";
import { getSellOrderById } from "@/db/functions/sell-order";
import { getSellOrderLineById } from "@/db/functions/sell-order-line";
import {
  dbTableClient,
  dbTableDeliveryNoteLine,
  dbTableMachineProductionOrderQueue,
  dbTableMaterial,
  dbTablePart,
  dbTablePartMaterial,
  dbTablePartReference,
  dbTableProductionOrder,
  dbTableSellOrder,
  dbTableSellOrderLine,
  dbTableTreatmentReception,
  dbTableTreatmentShipment,
} from "@/db/schema";
import { computeProductionOrderStatus } from "@/lib/production-order";
import type { ProductionOrderStatus, TProductionOrderFilters } from "@/schemas/production-order";
import { getFilterValue } from "@/schemas/utils";
import type { TBaseQueryProps } from "@/types";
import type { BaseMachine } from "@/types/machine";
import type { BaseProductionOrder } from "@/types/production-order";

export async function dbGetProductionOrderStatus(
  productionOrder: BaseProductionOrder,
  dbConnection: TDatabase = db,
): Promise<ProductionOrderStatus> {
  const sellOrderLine =
    productionOrder.sellOrderLineId !== null
      ? await getSellOrderLineById(productionOrder.sellOrderLineId, dbConnection)
      : undefined;
  const sellOrder =
    sellOrderLine !== undefined ? await getSellOrderById(sellOrderLine.sellOrderId, dbConnection) : undefined;
  const part = await dbConnection.query.dbTablePart.findFirst({ where: { id: productionOrder.partId } });
  const machinesWorkingOnOrder = await getMachines(
    {
      filters: [{ id: "activeProductionOrderId", value: productionOrder.id }],
    },
    dbConnection,
  );

  return computeProductionOrderStatus({
    ...productionOrder,
    ...(await getProductionOrderTreatmentQuantities(productionOrder.id, dbConnection)),
    isActiveOnMachine: machinesWorkingOnOrder.length > 0,
    needsTreatment: part?.coatingId != null,
    producedQuantity: await getProductionOrderProducedQuantity(productionOrder.id, dbConnection),
    sellOrderLine: sellOrderLine && { ...sellOrderLine, sellOrder },
  });
}

const sumQuantity = (column: PgColumn) => sql<number>`coalesce(sum(${column}), 0)`.mapWith(Number);

export async function getProductionOrderTreatmentQuantities(productionOrderId: number, dbConnection: TDatabase = db) {
  const [sent] = await dbConnection
    .select({ quantity: sumQuantity(dbTableTreatmentShipment.quantity) })
    .from(dbTableTreatmentShipment)
    .where(eq(dbTableTreatmentShipment.productionOrderId, productionOrderId));
  const [received] = await dbConnection
    .select({ quantity: sumQuantity(dbTableTreatmentReception.quantity) })
    .from(dbTableTreatmentReception)
    .innerJoin(dbTableTreatmentShipment, eq(dbTableTreatmentShipment.id, dbTableTreatmentReception.treatmentShipmentId))
    .where(eq(dbTableTreatmentShipment.productionOrderId, productionOrderId));
  return { receivedQuantity: received.quantity, sentQuantity: sent.quantity };
}

export function getProductionOrderById(productionOrderId: number, dbConnection: TDatabase = db) {
  return dbConnection.query.dbTableProductionOrder.findFirst({
    where: { id: productionOrderId },
  });
}

export async function getProductionOrderAssignedMachines(
  productionOrderId: number,
  dbConnection: TDatabase = db,
): Promise<Array<BaseMachine>> {
  const machineProductionOrders = await dbConnection.query.dbTableMachineProductionOrderQueue.findMany({
    where: { productionOrderId },
    with: {
      machine: true,
    },
  });
  return machineProductionOrders.map((mpo) => mpo.machine);
}

export async function getProductionOrderProducedQuantity(
  productionOrderId: number,
  dbConnection: TDatabase = db,
): Promise<number> {
  const partProductions = await dbConnection.query.dbTablePartProduction.findMany({
    where: { productionOrderId },
  });
  return partProductions.reduce((sum, mpp) => sum + mpp.quantity, 0);
}

const PRODUCTION_ORDER_SORTABLE_COLUMNS = {
  id: dbTableProductionOrder.id,
  clientName: dbTableClient.name,
  requestedDeliveryDate: dbTableSellOrderLine.requestedDeliveryDate,
} satisfies Record<string, PgColumn>;

export async function getProductionOrders(
  { filters, sorts }: TBaseQueryProps<TProductionOrderFilters> = {},
  dbConnection: TDatabase = db,
): Promise<Array<BaseProductionOrder>> {
  const baseQuery = dbConnection.select(getColumns(dbTableProductionOrder)).from(dbTableProductionOrder);

  const assignedMachineId = getFilterValue(filters, "assignedMachineId");
  const clientName = getFilterValue(filters, "clientName");
  const deliveryNoteId = getFilterValue(filters, "deliveryNoteId");
  const materialRawMaterialId = getFilterValue(filters, "materialRawMaterialId");
  const partDescription = getFilterValue(filters, "partDescription");
  const partId = getFilterValue(filters, "partId");
  const partReference = getFilterValue(filters, "partReference");
  const partShapeId = getFilterValue(filters, "partShapeId");
  const partWidth = getFilterValue(filters, "partWidth");
  const quantity = getFilterValue(filters, "quantity");
  const sellOrderId = getFilterValue(filters, "sellOrderId");

  const needsClient = clientName != null || sorts?.some((sort) => sort.id === "clientName") === true;
  const needsSellOrderLine =
    needsClient ||
    partReference != null ||
    sellOrderId != null ||
    sorts?.some((sort) => sort.id === "requestedDeliveryDate") === true;

  if (needsSellOrderLine) {
    baseQuery.leftJoin(dbTableSellOrderLine, eq(dbTableProductionOrder.sellOrderLineId, dbTableSellOrderLine.id));
  }
  if (needsClient) {
    baseQuery
      .leftJoin(dbTableSellOrder, eq(dbTableSellOrderLine.sellOrderId, dbTableSellOrder.id))
      .leftJoin(dbTableClient, eq(dbTableSellOrder.clientId, dbTableClient.id));
  }
  if (partReference != null) {
    baseQuery.leftJoin(dbTablePartReference, eq(dbTableSellOrderLine.partReferenceId, dbTablePartReference.id));
  }
  if (
    partDescription != null ||
    partShapeId != null ||
    partWidth != null ||
    sorts?.some((sort) => sort.id === "dimension") === true
  ) {
    baseQuery.leftJoin(dbTablePart, eq(dbTableProductionOrder.partId, dbTablePart.id));
  }

  const numericPartWidth = sql`case when pg_input_is_valid(${dbTablePart.width}, 'numeric') then ${dbTablePart.width}::numeric end`;

  const whereClauses: Array<SQL> = [];
  if (assignedMachineId != null) {
    whereClauses.push(
      exists(
        dbConnection
          .select()
          .from(dbTableMachineProductionOrderQueue)
          .where(
            and(
              eq(dbTableMachineProductionOrderQueue.productionOrderId, dbTableProductionOrder.id),
              eq(dbTableMachineProductionOrderQueue.machineId, assignedMachineId),
            ),
          ),
      ),
    );
  }
  if (clientName != null) {
    whereClauses.push(searchInStringColumnIgnoreDiacritics(dbTableClient.name, clientName));
  }
  if (deliveryNoteId != null) {
    whereClauses.push(
      exists(
        dbConnection
          .select()
          .from(dbTableDeliveryNoteLine)
          .where(
            and(
              eq(dbTableDeliveryNoteLine.sellOrderLineId, dbTableProductionOrder.sellOrderLineId),
              eq(dbTableDeliveryNoteLine.deliveryNoteId, deliveryNoteId),
            ),
          ),
      ),
    );
  }
  if (materialRawMaterialId != null) {
    whereClauses.push(
      exists(
        dbConnection
          .select()
          .from(dbTablePartMaterial)
          .innerJoin(dbTableMaterial, eq(dbTablePartMaterial.materialId, dbTableMaterial.id))
          .where(
            and(
              eq(dbTablePartMaterial.partId, dbTableProductionOrder.partId),
              eq(dbTableMaterial.rawMaterialId, materialRawMaterialId),
            ),
          ),
      ),
    );
  }
  if (partDescription != null) {
    whereClauses.push(searchInStringColumnIgnoreDiacritics(dbTablePart.description, partDescription));
  }
  if (partId != null) {
    whereClauses.push(eq(dbTableProductionOrder.partId, partId));
  }
  if (partReference != null) {
    whereClauses.push(searchInStringColumnIgnoreDiacritics(dbTablePartReference.reference, partReference));
  }
  if (partShapeId != null) {
    whereClauses.push(eq(dbTablePart.shapeId, partShapeId));
  }
  if (partWidth != null) {
    whereClauses.push(eq(numericPartWidth, Number(partWidth)));
  }
  if (quantity != null) {
    whereClauses.push(eq(dbTableProductionOrder.quantity, quantity));
  }
  if (sellOrderId != null) {
    whereClauses.push(eq(dbTableSellOrderLine.sellOrderId, sellOrderId));
  }

  if (whereClauses.length > 0) {
    baseQuery.where(and(...whereClauses));
  }

  const orderByClauses: Array<SQL> = [];
  for (const sort of sorts ?? []) {
    if (sort.id === "dimension") {
      // width is free text, so only valid numbers are cast; the rest sort as 0, like the client sort does
      const numericWidth = sql`coalesce(${numericPartWidth}, 0)`;
      orderByClauses.push(sort.desc ? desc(numericWidth) : asc(numericWidth), desc(dbTablePart.shapeId));
      continue;
    }
    if (!isSortableColumn(PRODUCTION_ORDER_SORTABLE_COLUMNS, sort.id)) continue;
    const sortFunction = sort.desc ? desc : asc;
    orderByClauses.push(sortFunction(PRODUCTION_ORDER_SORTABLE_COLUMNS[sort.id]));
  }
  if (orderByClauses.length > 0) {
    baseQuery.orderBy(...orderByClauses);
  } else {
    baseQuery.orderBy(asc(dbTableProductionOrder.id));
  }

  return baseQuery;
}
