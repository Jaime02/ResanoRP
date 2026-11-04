import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import TableProductionOrder from "@/components/table/production-order";
import { PRODUCTION_ORDERS_LABEL } from "@/messages/production-order";
import { DEFAULT_PRODUCTION_ORDER_SORTING } from "@/queries/production-order";
import { ProductionOrderStatus, tableProductionOrderStateSchema } from "@/schemas/production-order";
import type { TTableProductionOrderState } from "@/schemas/production-order";
import { TableMode } from "@/types";

const DEFAULT_PRODUCTION_ORDER_TABLE_STATE: TTableProductionOrderState = {
  pagination: { pageSize: 10 },
  sorts: DEFAULT_PRODUCTION_ORDER_SORTING,
  filters: [{ id: "statuses", value: [ProductionOrderStatus.Pending, ProductionOrderStatus.InProduction] }],
};

const routeSearchSchema = z.object({
  "table-production-order": tableProductionOrderStateSchema.optional().catch(undefined),
});

export const Route = createFileRoute("/production-order/")({
  beforeLoad: () => ({
    title: PRODUCTION_ORDERS_LABEL,
  }),
  component: RouteComponent,
  validateSearch: routeSearchSchema,
});

function RouteComponent() {
  const { "table-production-order": tableProductionOrderState } = Route.useSearch();

  return (
    <TableProductionOrder
      tableMode={TableMode.Editable}
      className="mx-auto"
      state={tableProductionOrderState}
      defaultState={DEFAULT_PRODUCTION_ORDER_TABLE_STATE}
    />
  );
}
