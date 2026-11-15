import type { TDatabase } from "@/db";
import db from "@/db";
import { getMachines } from "@/db/functions/machine";
import { dbGetProductionOrderStatus } from "@/db/functions/production-order";
import { getSellOrderById } from "@/db/functions/sell-order";
import { computeProductionOrderStatus } from "@/lib/production-order";
import { computeSellOrderLineStatus } from "@/lib/sell-order-line";
import type { SellOrderLineStatus } from "@/schemas/sell-order-line";
import type { BaseSellOrder } from "@/types/sell-order";
import type { BaseSellOrderLine } from "@/types/sell-order-line";

export async function getSellOrderLinesBySellOrderId(
  sellOrderId: number,
  dbConnection: TDatabase = db,
): Promise<Array<BaseSellOrderLine>> {
  return dbConnection.query.dbTableSellOrderLine.findMany({
    where: { sellOrderId },
  });
}

export function getPendingSellOrderLinesByClientId(clientId: number, dbConnection: TDatabase = db) {
  return dbConnection.query.dbTableSellOrderLine.findMany({
    where: {
      deletedAt: { isNull: true },
      pendingQuantity: { ne: 0 },
      sellOrder: { clientId, deletedAt: { isNull: true } },
    },
    with: {
      partReference: { with: { part: true } },
      sellOrder: true,
    },
  });
}

export async function getSellOrderLineById(
  sellOrderLineId: number,
  dbConnection: TDatabase = db,
): Promise<BaseSellOrderLine | undefined> {
  return dbConnection.query.dbTableSellOrderLine.findFirst({
    where: { id: sellOrderLineId },
  });
}

const sumQuantities = (rows: Array<{ quantity: number }>) => rows.reduce((sum, row) => sum + row.quantity, 0);

// The same statuses as getSellOrderLineStatus, with one query per table instead of about seven per Orden de
// producción, which would fill the connection pool for a Cliente with many Líneas
export async function getSellOrderLineStatuses(
  sellOrderLines: Array<BaseSellOrderLine & { sellOrder: BaseSellOrder | null }>,
  dbConnection: TDatabase = db,
): Promise<Map<number, SellOrderLineStatus>> {
  const productionOrders = await dbConnection.query.dbTableProductionOrder.findMany({
    where: { sellOrderLineId: { in: sellOrderLines.map((sellOrderLine) => sellOrderLine.id) } },
    with: { part: true, partProductions: true, treatmentShipments: { with: { treatmentReceptions: true } } },
  });
  const activeProductionOrderIds = new Set(
    (
      await getMachines(
        {
          filters: [
            { id: "activeProductionOrderIds", value: productionOrders.map((productionOrder) => productionOrder.id) },
          ],
        },
        dbConnection,
      )
    ).map((machine) => machine.activeProductionOrderId),
  );

  return new Map(
    sellOrderLines.map((sellOrderLine) => {
      const sellOrder = sellOrderLine.sellOrder!;
      const productionOrderStatuses = productionOrders
        .filter((productionOrder) => productionOrder.sellOrderLineId === sellOrderLine.id)
        .map((productionOrder) =>
          computeProductionOrderStatus({
            ...productionOrder,
            isActiveOnMachine: activeProductionOrderIds.has(productionOrder.id),
            needsTreatment: productionOrder.part.coatingId != null,
            producedQuantity: sumQuantities(productionOrder.partProductions),
            receivedQuantity: sumQuantities(
              productionOrder.treatmentShipments.flatMap((treatmentShipment) => treatmentShipment.treatmentReceptions),
            ),
            sentQuantity: sumQuantities(productionOrder.treatmentShipments),
            sellOrderLine: { ...sellOrderLine, sellOrder },
          }),
        );
      return [sellOrderLine.id, computeSellOrderLineStatus({ productionOrderStatuses, sellOrder, sellOrderLine })];
    }),
  );
}

export async function getSellOrderLineStatus(
  {
    sellOrderLine,
    sellOrder,
  }: {
    sellOrderLine: BaseSellOrderLine;
    sellOrder?: BaseSellOrder;
  },
  dbConnection: TDatabase = db,
) {
  const productionOrders = await dbConnection.query.dbTableProductionOrder.findMany({
    where: { sellOrderLineId: sellOrderLine.id },
  });

  return computeSellOrderLineStatus({
    productionOrderStatuses: await Promise.all(
      productionOrders.map(async (productionOrder) => dbGetProductionOrderStatus(productionOrder, dbConnection)),
    ),
    sellOrder: (sellOrder ?? (await getSellOrderById(sellOrderLine.sellOrderId, dbConnection)))!,
    sellOrderLine,
  });
}
