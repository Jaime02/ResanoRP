import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useState } from "react";

import ButtonLink from "@/components/ui/button-link";
import { UserMode } from "@/contexts/app-context";
import FormSellOrder from "@/form/forms/sell-order";
import { SELL_ORDER_CREATE_TITLE, VIEW_SELL_ORDERS_LABEL } from "@/messages/sell-order";
import { FormMode } from "@/types";
import type { BaseSellOrderSerialized } from "@/types/sell-order";

export const Route = createFileRoute("/create-sell-order")({
  beforeLoad: () => ({
    title: SELL_ORDER_CREATE_TITLE,
  }),
  component: RouteComponent,
  staticData: { userModes: [UserMode.Admin] },
});

function RouteComponent() {
  const navigate = useNavigate();
  const [isNavigating, setIsNavigating] = useState(false);

  const onSubmit = useCallback(
    async (sellOrder: BaseSellOrderSerialized) => {
      setIsNavigating(true);
      await navigate({
        params: { id: sellOrder.id },
        to: "/sell-order/$id",
      });
      setIsNavigating(false);
    },
    [navigate],
  );

  return (
    <>
      <ButtonLink to="/sell-order" className="self-center">
        {VIEW_SELL_ORDERS_LABEL}
      </ButtonLink>
      <FormSellOrder requestedFormMode={FormMode.Create} onSubmit={onSubmit} skipQueries={isNavigating} />
    </>
  );
}
