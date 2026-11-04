import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { z } from "zod";

import { UserMode } from "@/contexts/app-context";
import FormProductionOrder from "@/form/forms/production-order";
import { PRODUCTION_ORDER_CREATE_TITLE } from "@/messages/production-order";
import { requiredIdSchema } from "@/schemas";
import { FormMode } from "@/types";
import type { BaseProductionOrderSerialized } from "@/types/production-order";

const routeSearchSchema = z.object({
  sellOrderLineId: requiredIdSchema.optional().catch(undefined),
});

export const Route = createFileRoute("/create-production-order")({
  beforeLoad: () => ({
    title: PRODUCTION_ORDER_CREATE_TITLE,
  }),
  component: RouteComponent,
  staticData: { userModes: [UserMode.Admin] },
  validateSearch: routeSearchSchema,
});

function RouteComponent() {
  const navigate = useNavigate();
  const { sellOrderLineId } = Route.useSearch();

  const onSubmit = useCallback(
    async (productionOrder: BaseProductionOrderSerialized) => {
      await navigate({ params: { id: productionOrder.id }, to: "/production-order/$id" });
    },
    [navigate],
  );

  return (
    <FormProductionOrder
      requestedFormMode={FormMode.Create}
      createSellOrderLineId={sellOrderLineId}
      onSubmit={onSubmit}
    />
  );
}
