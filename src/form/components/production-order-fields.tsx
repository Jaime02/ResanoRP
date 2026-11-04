import ButtonLink from "@/components/ui/button-link";
import DateInput from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import FieldLabel from "@/form/components/field-label";
import FieldLayoutContainer from "@/form/components/field-layout-container";
import { CLIENT_LABEL, DELIVERY_DATE_LABEL, NOT_SPECIFIED_MESSAGE } from "@/messages/common";
import { UNITS_PRODUCED_LABEL, UNITS_TO_PRODUCE_LABEL } from "@/messages/production-order";
import { NO_SELL_ORDER_MESSAGE, SELL_ORDER_LABEL } from "@/messages/sell-order";
import type { TActiveProductionOrder } from "@/queries/production-order";

interface ProductionOrderFieldsProps {
  productionOrder?: TActiveProductionOrder;
  producedQuantity?: number;
}

export default function ProductionOrderFields({ productionOrder, producedQuantity }: ProductionOrderFieldsProps) {
  const sellOrder = productionOrder?.sellOrderLine?.sellOrder;
  return (
    <>
      <FieldLayoutContainer>
        <FieldLabel>{CLIENT_LABEL}</FieldLabel>
        <Input value={sellOrder?.client?.name ?? ""} readOnly />
      </FieldLayoutContainer>
      <FieldLayoutContainer>
        <FieldLabel>{SELL_ORDER_LABEL}</FieldLabel>
        {sellOrder != null ? (
          <ButtonLink to="/sell-order/$id" params={{ id: sellOrder.id }} target="_blank">
            {sellOrder.clientReference ?? String(sellOrder.id)}
          </ButtonLink>
        ) : (
          NO_SELL_ORDER_MESSAGE
        )}
      </FieldLayoutContainer>
      {productionOrder?.sellOrderLine != null && (
        <FieldLayoutContainer>
          <FieldLabel>{DELIVERY_DATE_LABEL}</FieldLabel>
          <DateInput
            date={productionOrder.sellOrderLine.requestedDeliveryDate}
            disabled
            emptyMessage={NOT_SPECIFIED_MESSAGE}
          />
        </FieldLayoutContainer>
      )}
      <FieldLayoutContainer>
        <FieldLabel>{UNITS_TO_PRODUCE_LABEL}</FieldLabel>
        <Input value={productionOrder?.quantity} readOnly />
      </FieldLayoutContainer>
      <FieldLayoutContainer>
        <FieldLabel>{UNITS_PRODUCED_LABEL}</FieldLabel>
        <Input value={producedQuantity} readOnly />
      </FieldLayoutContainer>
    </>
  );
}
