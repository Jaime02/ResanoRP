import type { ComboboxModelProps } from "@/components/combobox/model";
import ComboboxModel from "@/components/combobox/model";
import { NO_SHAPES_MESSAGE, SELECT_SHAPE_PLACEHOLDER } from "@/messages/combobox";
import { useQueryShapes } from "@/queries/shape";
import type { BaseShape } from "@/types/shape";

export default function ComboboxShape(props: ComboboxModelProps<BaseShape>) {
  return (
    <ComboboxModel
      modelName="Shapes"
      useQueryItems={useQueryShapes}
      placeholder={SELECT_SHAPE_PLACEHOLDER}
      noItemsMessage={NO_SHAPES_MESSAGE}
      {...props}
    />
  );
}
