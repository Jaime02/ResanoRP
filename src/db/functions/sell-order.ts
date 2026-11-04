import {
  and,
  asc,
  desc,
  eq,
  exists,
  getColumns,
  gte,
  isNotNull,
  isNull,
  lte,
  ne,
  not,
  notExists,
  or,
} from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

import type { TDatabase } from "@/db";
import db, { searchInStringColumnIgnoreDiacritics } from "@/db";
import { isSortableColumn } from "@/db/functions";
import { dbTableClient, dbTablePartReference, dbTableSellOrder, dbTableSellOrderLine } from "@/db/schema";
import { endOfAppDay, startOfAppDay } from "@/lib/dates";
import type { TSellOrderFilters } from "@/schemas/sell-order";
import { SellOrderStatus } from "@/schemas/sell-order";
import { getFilterValue } from "@/schemas/utils";
import type { TBaseQueryProps } from "@/types";
import type { BaseSellOrder } from "@/types/sell-order";

const SELL_ORDER_SORTABLE_COLUMNS = {
  id: dbTableSellOrder.id,
  clientName: dbTableClient.name,
  receptionDate: dbTableSellOrder.receptionDate,
} satisfies Record<string, PgColumn>;

export async function getSellOrderById(
  sellOrderId: number,
  dbConnection: TDatabase = db,
): Promise<BaseSellOrder | undefined> {
  return dbConnection.query.dbTableSellOrder.findFirst({ where: { id: sellOrderId } });
}

function sellOrderStatusesFilter(statuses: Array<SellOrderStatus>, dbConnection: TDatabase = db): SQL {
  const isDeleted = not(isNull(dbTableSellOrder.deletedAt));
  const isClientDeleted = exists(
    dbConnection
      .select()
      .from(dbTableClient)
      .where(and(eq(dbTableClient.id, dbTableSellOrder.clientId), isNotNull(dbTableClient.deletedAt))),
  );
  const isCompleted = notExists(
    dbConnection
      .select()
      .from(dbTableSellOrderLine)
      .where(
        and(
          eq(dbTableSellOrderLine.sellOrderId, dbTableSellOrder.id),
          isNull(dbTableSellOrderLine.deletedAt),
          ne(dbTableSellOrderLine.pendingQuantity, 0),
        ),
      ),
  );

  const filters = statuses
    .map((status) => {
      switch (status) {
        case SellOrderStatus.Deleted:
          return isDeleted;
        case SellOrderStatus.ClientDeleted:
          return and(not(isDeleted), isClientDeleted);
        case SellOrderStatus.Completed:
          return and(not(isDeleted), not(isClientDeleted), isCompleted);
        case SellOrderStatus.Pending:
          return and(not(isCompleted), not(isDeleted), not(isClientDeleted));
      }
    })
    .filter((f): f is SQL => f !== undefined);
  return or(...filters)!;
}

export async function getSellOrders(
  { filters, sorts }: TBaseQueryProps<TSellOrderFilters> = {},
  dbConnection: TDatabase = db,
): Promise<Array<BaseSellOrder>> {
  const baseQuery = dbConnection.select(getColumns(dbTableSellOrder)).from(dbTableSellOrder);

  const clientId = getFilterValue(filters, "clientId");
  const clientName = getFilterValue(filters, "clientName");
  const id = getFilterValue(filters, "id");
  const partId = getFilterValue(filters, "partId");
  const receptionDate = getFilterValue(filters, "receptionDate");
  const statuses = getFilterValue(filters, "statuses");

  if (clientName != null || sorts?.some((sort) => sort.id === "clientName") === true) {
    baseQuery.leftJoin(dbTableClient, eq(dbTableSellOrder.clientId, dbTableClient.id));
  }

  const whereClauses: Array<SQL> = [];
  if (clientId != null) {
    whereClauses.push(eq(dbTableSellOrder.clientId, clientId));
  }
  if (clientName != null) {
    whereClauses.push(searchInStringColumnIgnoreDiacritics(dbTableClient.name, clientName));
  }
  if (id != null) {
    whereClauses.push(eq(dbTableSellOrder.id, id));
  }
  if (partId != null) {
    whereClauses.push(
      exists(
        dbConnection
          .select()
          .from(dbTableSellOrderLine)
          .innerJoin(dbTablePartReference, eq(dbTableSellOrderLine.partReferenceId, dbTablePartReference.id))
          .where(
            and(eq(dbTableSellOrderLine.sellOrderId, dbTableSellOrder.id), eq(dbTablePartReference.partId, partId)),
          ),
      ),
    );
  }
  if (receptionDate?.startDate != null) {
    whereClauses.push(gte(dbTableSellOrder.receptionDate, startOfAppDay(receptionDate.startDate)));
  }
  if (receptionDate?.endDate != null) {
    whereClauses.push(lte(dbTableSellOrder.receptionDate, endOfAppDay(receptionDate.endDate)));
  }
  if (statuses != null && statuses.length > 0) {
    whereClauses.push(sellOrderStatusesFilter(statuses, dbConnection));
  }

  if (whereClauses.length > 0) {
    baseQuery.where(and(...whereClauses));
  }

  const orderByClauses: Array<SQL> = [];
  for (const sort of sorts ?? []) {
    if (!isSortableColumn(SELL_ORDER_SORTABLE_COLUMNS, sort.id)) continue;
    const sortFunction = sort.desc ? desc : asc;
    orderByClauses.push(sortFunction(SELL_ORDER_SORTABLE_COLUMNS[sort.id]));
  }
  if (orderByClauses.length > 0) {
    baseQuery.orderBy(...orderByClauses);
  } else {
    baseQuery.orderBy(desc(dbTableSellOrder.id));
  }
  return baseQuery;
}
