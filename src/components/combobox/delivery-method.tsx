import type { ComboboxModelProps } from "@/components/combobox/model";
import ComboboxModel from "@/components/combobox/model";
import ButtonLink from "@/components/ui/button-link";
import { NO_DELIVERY_METHODS_MESSAGE, SELECT_DELIVERY_METHOD_PLACEHOLDER } from "@/messages/combobox";
import { DELIVERY_METHODS_LABEL } from "@/messages/maintenance";
import { useQueryDeliveryMethodById, useQueryDeliveryMethods } from "@/queries/delivery-method";
import type { BaseDeliveryMethod } from "@/types/delivery-method";

export default function ComboboxDeliveryMethod(props: ComboboxModelProps<BaseDeliveryMethod>) {
  const { data: activeDeliveryMethod } = useQueryDeliveryMethodById(props.activeItemId);

  return (
    <ComboboxModel
      modelName="DeliveryMethods"
      useQueryItems={useQueryDeliveryMethods}
      activeItem={activeDeliveryMethod ?? null}
      placeholder={SELECT_DELIVERY_METHOD_PLACEHOLDER}
      noItemsMessage={NO_DELIVERY_METHODS_MESSAGE}
      deletedItemLink={
        <ButtonLink testId="button-link-delivery-methods" to="/maintenance" search={{ tab: "deliveryMethod" }}>
          {DELIVERY_METHODS_LABEL}
        </ButtonLink>
      }
      {...props}
    />
  );
}
