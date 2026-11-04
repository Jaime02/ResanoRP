import type { TDatabase } from "@/db";
import db from "@/db";
import { dbGetProductionOrderStatus } from "@/db/functions/production-order";
import { getSellOrderById } from "@/db/functions/sell-order";
import { computeSellOrderLineStatus } from "@/lib/sell-order-line";
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
