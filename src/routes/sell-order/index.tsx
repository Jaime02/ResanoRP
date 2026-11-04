import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import TableSellOrder from "@/components/table/sell-order";
import { UserMode } from "@/contexts/app-context";
import { SELL_ORDERS_LABEL } from "@/messages/sell-order";
import { tableSellOrderStateSchema } from "@/schemas/sell-order";

const routeSearchSchema = z.object({
  "table-sell-order": tableSellOrderStateSchema.optional().catch(undefined),
});

export const Route = createFileRoute("/sell-order/")({
  beforeLoad: () => ({
    title: SELL_ORDERS_LABEL,
  }),
  component: RouteComponent,
  staticData: { userModes: [UserMode.Admin] },
  validateSearch: routeSearchSchema,
});

function RouteComponent() {
  const { "table-sell-order": tableSellOrderState } = Route.useSearch();

  return <TableSellOrder className="mx-auto" state={tableSellOrderState} />;
}
