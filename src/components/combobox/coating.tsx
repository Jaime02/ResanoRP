import type { ComboboxModelProps } from "@/components/combobox/model";
import ComboboxModel from "@/components/combobox/model";
import { NO_COATINGS_MESSAGE, SELECT_COATING_PLACEHOLDER } from "@/messages/combobox";
import { useQueryCoatings } from "@/queries/coating";
import type { BaseCoating } from "@/types/coating";

export default function ComboboxCoating(props: ComboboxModelProps<BaseCoating>) {
  return (
    <ComboboxModel
      modelName="Coatings"
      useQueryItems={useQueryCoatings}
      placeholder={SELECT_COATING_PLACEHOLDER}
      noItemsMessage={NO_COATINGS_MESSAGE}
      {...props}
    />
  );
}
