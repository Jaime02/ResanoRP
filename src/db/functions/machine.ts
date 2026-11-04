import { and, asc, desc, eq, getColumns, inArray, isNull, notInArray } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

import type { TDatabase } from "@/db";
import db, { searchInStringColumnIgnoreDiacritics } from "@/db";
import { isSortableColumn } from "@/db/functions";
import { dbTableMachine } from "@/db/schema";
import type { TMachineFilters } from "@/schemas/machine";
import { getFilterValue } from "@/schemas/utils";
import type { TBaseQueryProps } from "@/types";
import type { BaseMachine } from "@/types/machine";

const MACHINE_SORTABLE_COLUMNS = {
  id: dbTableMachine.id,
  name: dbTableMachine.name,
} satisfies Record<string, PgColumn>;

export async function getMachines(
  { filters, sorts }: TBaseQueryProps<TMachineFilters> = {},
  dbConnection: TDatabase = db,
): Promise<Array<BaseMachine>> {
  const baseQuery = dbConnection.select(getColumns(dbTableMachine)).from(dbTableMachine);

  const activeProductionOrderId = getFilterValue(filters, "activeProductionOrderId");
  const activeProductionOrderIds = getFilterValue(filters, "activeProductionOrderIds");
  const excludeItemIds = getFilterValue(filters, "excludeItemIds");
  const name = getFilterValue(filters, "name");
  const deletedAt = getFilterValue(filters, "deletedAt");

  const whereClauses: Array<SQL> = [];
  if (activeProductionOrderId != null) {
    whereClauses.push(eq(dbTableMachine.activeProductionOrderId, activeProductionOrderId));
  }
  if (activeProductionOrderIds != null) {
    whereClauses.push(inArray(dbTableMachine.activeProductionOrderId, activeProductionOrderIds));
  }
  if (excludeItemIds != null) {
    whereClauses.push(notInArray(dbTableMachine.id, excludeItemIds));
  }
  if (name != null) {
    whereClauses.push(searchInStringColumnIgnoreDiacritics(dbTableMachine.name, name));
  }
  if (deletedAt !== true) {
    whereClauses.push(isNull(dbTableMachine.deletedAt));
  }

  if (whereClauses.length > 0) {
    baseQuery.where(and(...whereClauses));
  }

  const orderByClauses: Array<SQL> = [];
  for (const sort of sorts ?? []) {
    if (!isSortableColumn(MACHINE_SORTABLE_COLUMNS, sort.id)) continue;
    const sortFunction = sort.desc ? desc : asc;
    orderByClauses.push(sortFunction(MACHINE_SORTABLE_COLUMNS[sort.id]));
  }
  if (orderByClauses.length > 0) {
    baseQuery.orderBy(...orderByClauses);
  } else {
    baseQuery.orderBy(asc(dbTableMachine.id));
  }

  return baseQuery;
}

export function getMachineById(machineId: number, dbConnection: TDatabase = db) {
  return dbConnection.query.dbTableMachine.findFirst({
    where: { id: machineId },
  });
}
