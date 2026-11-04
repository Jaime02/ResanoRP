import type { ComboboxModelProps } from "@/components/combobox/model";
import ComboboxModel from "@/components/combobox/model";
import { NO_RAW_MATERIALS_MESSAGE, SELECT_RAW_MATERIAL_PLACEHOLDER } from "@/messages/combobox";
import { useQueryRawMaterials } from "@/queries/raw-material";
import type { BaseRawMaterial } from "@/types/raw-material";

export default function ComboboxRawMaterial(props: ComboboxModelProps<BaseRawMaterial>) {
  return (
    <ComboboxModel
      modelName="RawMaterials"
      useQueryItems={useQueryRawMaterials}
      placeholder={SELECT_RAW_MATERIAL_PLACEHOLDER}
      noItemsMessage={NO_RAW_MATERIALS_MESSAGE}
      {...props}
    />
  );
}
