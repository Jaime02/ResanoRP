import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import TablePendingPartPrice from "@/components/table/pending-part-price";
import { UserMode } from "@/contexts/app-context";
import { PRICE_CALCULATOR_TITLE } from "@/messages/part-price";
import { tablePendingPartPriceStateSchema } from "@/schemas/part-price";

const routeSearchSchema = z.object({
  "table-pending-part-price": tablePendingPartPriceStateSchema.optional().catch(undefined),
});

export const Route = createFileRoute("/price-calculator/")({
  beforeLoad: () => ({
    title: PRICE_CALCULATOR_TITLE,
  }),
  component: RouteComponent,
  staticData: { userModes: [UserMode.Admin] },
  validateSearch: routeSearchSchema,
});

function RouteComponent() {
  const { "table-pending-part-price": tablePendingPartPriceState } = Route.useSearch();

  return <TablePendingPartPrice state={tablePendingPartPriceState} className="self-center" />;
}
