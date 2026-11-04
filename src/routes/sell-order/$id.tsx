import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import ButtonLink from "@/components/ui/button-link";
import SiblingControls from "@/components/ui/sibling-controls";
import { UserMode, useAppContext } from "@/contexts/app-context";
import FormSellOrder from "@/form/forms/sell-order";
import { SELL_ORDER_CREATE_TITLE, VIEW_SELL_ORDERS_LABEL } from "@/messages/sell-order";
import { useQuerySellOrderNavigationIds } from "@/queries/sell-order";
import { optionalIdSchema } from "@/schemas";
import { FormMode } from "@/types";

const routeParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const routeSearchSchema = z.object({
  createSellOrderLine: z.boolean().optional().catch(undefined),
  editPartPriceId: optionalIdSchema.catch(undefined),
});

export const Route = createFileRoute("/sell-order/$id")({
  beforeLoad: ({ params }) => ({
    title: `Pedido de venta ${params.id}`,
  }),
  component: RouteComponent,
  params: routeParamsSchema,
  staticData: { userModes: [UserMode.Admin, UserMode.User, UserMode.Machine] },
  validateSearch: routeSearchSchema,
});

function RouteComponent() {
  const { id } = Route.useParams();
  const { createSellOrderLine, editPartPriceId } = Route.useSearch();
  const { isAdmin } = useAppContext();
  const siblings = useSellOrderNavigation(id);

  return (
    <div className="flex flex-col items-center gap-3">
      {isAdmin && (
        <div className="flex flex-row flex-wrap justify-center gap-3 self-center">
          <ButtonLink to="/sell-order">{VIEW_SELL_ORDERS_LABEL}</ButtonLink>
          <SiblingControls url="." currentId={id} siblings={siblings} />
          <ButtonLink variant="success" to="/create-sell-order">
            {SELL_ORDER_CREATE_TITLE}
          </ButtonLink>
        </div>
      )}
      {isAdmin ? (
        <FormSellOrder
          requestedFormMode={FormMode.Update}
          editSellOrderId={id}
          createSellOrderLine={createSellOrderLine}
          editPartPriceId={editPartPriceId}
        />
      ) : (
        <FormSellOrder requestedFormMode={FormMode.ReadOnly} editSellOrderId={id} showActions={false} />
      )}
    </div>
  );
}

// TODO mejora esta wea
function useSellOrderNavigation(id: number | undefined) {
  return useQuerySellOrderNavigationIds(id);
}
